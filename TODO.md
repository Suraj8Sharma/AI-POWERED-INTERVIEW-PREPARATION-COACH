# PDF Report Generation TODO

## Plan Steps:
- [x] Install reportlab: pip install reportlab
- [x] Backend: Add POST /api/report/{session_id}/pdf in web/api.py using ReportLab to generate PDF from report data
- [x] Frontend: Update web/static/js/app.js showReport() to fetch/download PDF after rendering
- [ ] DB: Store PDF path in MongoDB user.reports[] array (for session.user_id)
- [ ] Test full flow: interview → report → PDF download
- [ ] Update TODO.md
- [ ] attempt_completion

