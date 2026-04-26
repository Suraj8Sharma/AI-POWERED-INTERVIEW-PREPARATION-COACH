// Browser Supabase initializer - fetches public config from /api/public-config and exposes window.SB.
(async function () {
  try {
    const r = await fetch('/api/public-config');
    const cfg = await r.json();
    if (!cfg || !cfg.supabase_url || !cfg.supabase_anon_key) {
      console.warn('Supabase public config missing');
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.error('supabase-js not loaded. Add the CDN script before this file.');
      return;
    }

    window.supabaseClient = window.supabase.createClient(cfg.supabase_url, cfg.supabase_anon_key);

    function getProvider(user) {
      if (!user) return 'email';
      if (user.app_metadata && Array.isArray(user.app_metadata.providers) && user.app_metadata.providers.length) {
        return user.app_metadata.providers[0];
      }
      return user.app_metadata && user.app_metadata.provider ? user.app_metadata.provider : 'email';
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
    || https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6c63ff&color=fff&bold=true&size=128;

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
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    async function signInWithGoogle() {
      const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
      });
      if (error) throw error;
    }

    async function signUpWithEmail(name, email, password) {
      const payload = {
        email: email,
        password: password,
        options: { data: { name: name || '' } }
      };
      const { data, error } = await window.supabaseClient.auth.signUp(payload);
      if (error) throw error;
      if (data && data.session && data.session.access_token) {
        localStorage.setItem('sb_token', data.session.access_token);
        await syncProfile(data.user || (data.session && data.session.user));
      }
      return data;
    }

    async function signInWithEmail(email, password) {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (error) throw error;
      if (data && data.session && data.session.access_token) {
        localStorage.setItem('sb_token', data.session.access_token);
        await syncProfile(data.user || (data.session && data.session.user));
      }
      return data;
    }

    async function getSession() {
      const { data, error } = await window.supabaseClient.auth.getSession();
      if (error) throw error;
      if (data && data.session && data.session.access_token) {
        localStorage.setItem('sb_token', data.session.access_token);
        await syncProfile(data.session.user);
      } else {
        localStorage.removeItem('sb_token');
      }
      return (data && data.session) || null;
    }

    function getToken() {
      return localStorage.getItem('sb_token');
    }

    await getSession();

    window.SB = {
      client: window.supabaseClient,
      signInWithGoogle: signInWithGoogle,
      signUpWithEmail: signUpWithEmail,
      signInWithEmail: signInWithEmail,
      syncProfile: syncProfile,
      getSession: getSession,
      getToken: getToken
    };
    window.dispatchEvent(new Event('supabase:ready'));
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
  }
})();
