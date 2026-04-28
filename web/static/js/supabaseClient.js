(async function () {
  try {
    console.log('SB Step 1: fetching config');
    const r = await fetch('/api/public-config');
    const cfg = await r.json();
    console.log('SB Step 2: config loaded', cfg);

    if (!cfg || !cfg.supabase_url || !cfg.supabase_anon_key) {
      console.warn('SB: config missing, aborting');
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      console.error('SB: supabase-js not loaded');
      return;
    }

    console.log('SB Step 3: creating client');
    window.supabaseClient = window.supabase.createClient(
      cfg.supabase_url,
      cfg.supabase_anon_key
    );
    console.log('SB Step 4: client created');

    function getProvider(user) {
      if (!user) return 'email';
      if (user.app_metadata && Array.isArray(user.app_metadata.providers) && user.app_metadata.providers.length) {
        return user.app_metadata.providers[0];
      }
      return user.app_metadata && user.app_metadata.provider
        ? user.app_metadata.provider
        : 'email';
    }

    function buildProfilePayload(user) {
  if (!user || !user.id) return null;
  const metadata = user.user_metadata || {};
  
  // Build display name first so we can use it for fallback avatar
  const displayName = (metadata.name && metadata.name.trim())
    || (metadata.full_name && metadata.full_name.trim())
    || user.email
    || 'User';

  // Use Google photo if available, otherwise generate letter avatar
  const avatarUrl = metadata.avatar_url
    || metadata.picture
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6c63ff&color=fff&bold=true&size=128`;

  return {
    id: user.id,
    email: user.email || null,
    name: (metadata.name && metadata.name.trim()) || (metadata.full_name && metadata.full_name.trim()) || null,
    avatar_url: avatarUrl,
    provider: getProvider(user),
    metadata: metadata,
    last_sign_in_at: new Date().toISOString()
  };
}

    async function syncProfile(user) {
      const payload = buildProfilePayload(user);
      if (!payload) return null;
      try {
        const { data, error } = await window.supabaseClient
          .from('profiles')
          .upsert(payload, { onConflict: 'id' })
          .select()
          .single();
        if (error) {
          console.warn('SB: profile sync skipped:', error.message);
          return null;
        }
        return data;
      } catch (e) {
        console.warn('SB: profile sync failed:', e.message);
        return null;
      }
    }

    async function signInWithGoogle() {
      const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
      });
      if (error) throw error;
    }

    async function signUpWithEmail(name, email, password) {
      const { data, error } = await window.supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { name: name || '' } }
      });
      if (error) throw error;
      if (data && data.session && data.session.access_token) {
        localStorage.setItem('sb_token', data.session.access_token);
        await syncProfile(data.user || (data.session && data.session.user));
      }
      return data;
    }

    async function signInWithEmail(email, password) {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      if (data && data.session && data.session.access_token) {
        localStorage.setItem('sb_token', data.session.access_token);
        await syncProfile(data.user || (data.session && data.session.user));
      }
      return data;
    }

    async function getSession() {
      try {
        const { data, error } = await window.supabaseClient.auth.getSession();
        if (error) {
          console.warn('SB: getSession error:', error.message);
          localStorage.removeItem('sb_token');
          return null;
        }
        if (data && data.session && data.session.access_token) {
          localStorage.setItem('sb_token', data.session.access_token);
          await syncProfile(data.session.user);
        } else {
          localStorage.removeItem('sb_token');
        }
        return (data && data.session) || null;
      } catch (e) {
        console.warn('SB: getSession threw:', e.message);
        return null;
      }
    }

    function getToken() {
      return localStorage.getItem('sb_token');
    }

    console.log('SB Step 5: running getSession');
    await getSession();
    console.log('SB Step 6: getSession done');

    window.SB = {
      client: window.supabaseClient,
      signInWithGoogle,
      signUpWithEmail,
      signInWithEmail,
      syncProfile,
      getSession,
      getToken
    };
    // Handle Google OAuth redirect + existing sessions
window.supabaseClient.auth.onAuthStateChange(async function(event, session) {
    console.log('SB auth event:', event, session);

    if (session && session.user) {
        localStorage.setItem('sb_token', session.access_token);
        await syncProfile(session.user);

        // Update SB.getToken to return fresh token
        window.SB.getToken = function() {
            return localStorage.getItem('sb_token');
        };

        // Tell auth.js the user is ready
        const user = session.user;
        const name = user.user_metadata && 
                     (user.user_metadata.name || user.user_metadata.full_name) 
                     || null;
        const email = user.email || null;

        // Store for navbar
        if (name)  localStorage.setItem('preploom_display_name', name);
        if (email) localStorage.setItem('preploom_display_email', email);

        // Fire UI update
        if (window.PrepLoomAuthPremium && window.PrepLoomAuthPremium.refreshNav) {
            window.PrepLoomAuthPremium.refreshNav(name, email);
        } else if (window.PrepLoomAuth && window.PrepLoomAuth.refreshAuthUI) {
            window.PrepLoomAuth.refreshAuthUI();
        }

        // Close any open modals
        document.querySelectorAll('.modal-overlay.is-open').forEach(function(o) {
            o.classList.remove('is-open');
            o.setAttribute('aria-hidden', 'true');
        });
        document.body.style.overflow = '';

    } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sb_token');
        localStorage.removeItem('preploom_display_name');
        localStorage.removeItem('preploom_display_email');

        if (window.PrepLoomAuthPremium && window.PrepLoomAuthPremium.refreshNav) {
            window.PrepLoomAuthPremium.refreshNav(null, null);
        } else if (window.PrepLoomAuth && window.PrepLoomAuth.refreshAuthUI) {
            window.PrepLoomAuth.refreshAuthUI();
        }
    }
});

    console.log('SB Step 7: window.SB is set ✓');
    window.dispatchEvent(new Event('supabase:ready'));

  } catch (e) {
    console.error('SB FATAL ERROR — this is why window.SB is undefined:', e);
  }
})();