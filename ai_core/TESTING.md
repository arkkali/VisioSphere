Short test plan to verify CCTV end-to-end locally

1) Preconditions
- Ensure `ai_core` is running (run `run_ai_core.bat`). It serves on port 5001.
- Ensure `cloudflared` tunnel is running (use scheduled task or run manually):
  & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run visiosphere-cctv
- Ensure backend is reachable and configured (Heroku URL in `.env` BACKEND_URL or local backend running)

2) Quick checks
- Local AI core status:
  curl http://127.0.0.1:5001/status
- Public tunnel status:
  curl https://cctv.visiosphere.live/status

3) Synthetic alert (end-to-end)
- From `ai_core/` run:
  python synthetic_alert.py --location "House of Charbel" --type WARNING --message "FALL DETECTED"
- Verify on the dashboard (Heroku web UI) that a new incident appears and socket messages were broadcast.

4) Clip upload (optional)
- If you want `ai_core` to upload clips to S3, create an IAM user with scoped permissions and set these in `ai_core/.env`:
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  AWS_REGION=...
  CLIP_S3_BUCKET=your-bucket-name
  CLIP_S3_PREFIX=clips/
- Use the helper `s3_uploader.py` to upload a saved clip manually for verification:
  python s3_uploader.py upload ./some_clip.mp4 --bucket your-bucket --key clips/some_clip.mp4

5) Token gating
- Generate a token: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- Put it in `ai_core/.env` as `STREAM_TOKEN` and in Vercel as `VITE_STREAM_TOKEN`.
- Test access: `https://cctv.visiosphere.live/video_feed/House%20of%20Charbel` → 403 without `?key=` and streaming with `?key=<TOKEN>`.
