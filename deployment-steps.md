# VisioSphere — Deployment Steps
**Order: AWS S3 → Code Changes → Heroku → Vercel**

---

## STEP 1 — AWS S3

### 1.1 Create AWS account
1. Go to `aws.amazon.com` → **Create an AWS Account**
2. Enter email, password, account name → **Personal** account type
3. Enter credit card (required but won't be charged within free tier)
4. Complete phone verification → choose **Basic Support (Free)**

### 1.2 Create S3 bucket
1. Search **S3** in the AWS console → **Create bucket**
2. Bucket name: `visiosphere-uploads`
3. Region: **Asia Pacific (Singapore) ap-southeast-1**
4. Keep **"Block all public access" checked** (files are served through your backend)
5. Everything else default → **Create bucket**

### 1.3 Add CORS policy
1. Click your bucket → **Permissions** tab → scroll to **Cross-origin resource sharing (CORS)**
2. Click **Edit** → paste this:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```
3. **Save changes**

### 1.4 Create IAM credentials
1. Search **IAM** → **Users** → **Create user**
2. Username: `visiosphere-s3-user` → Next
3. **Attach policies directly** → search **AmazonS3FullAccess** → select it → Next → **Create user**
4. Click the user → **Security credentials** tab → **Create access key**
5. Choose **Application running outside AWS** → Next → **Create access key**
6. **Copy both values now** (you won't see the secret again):
   - Access Key ID
   - Secret Access Key

---

## STEP 2 — Code Changes

Three things to change. Do all of them, then commit once.

### 2.1 Add start script to `backend/package.json`
Open `backend/package.json` and update the scripts section:
```json
"scripts": {
  "start": "node server.js",
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

### 2.2 Fix Firebase service account for Heroku
`firebase-service-account.json` is gitignored and won't exist on Heroku.

**Get the base64 value** — run this once in your terminal from the `backend/` folder:
```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('./firebase-service-account.json')).toString('base64'))"
```
Copy the output — you'll paste it into Heroku Config Vars later.

**Update `backend/config/firebase.js`:**
```js
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
);

try {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('Firebase Admin SDK initialization error:', error);
}

module.exports = admin;
```

**Add to `backend/config/validateEnv.js`** — add `FIREBASE_SERVICE_ACCOUNT_BASE64` to the required vars array:
```js
const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'RESEND_API_KEY',
  'ALLOWED_ORIGIN',
  'NODE_ENV',
  'FIREBASE_SERVICE_ACCOUNT_BASE64',
];
```

### 2.3 Migrate Multer to S3
Only two places use disk storage long-term: guardian photos and assessment file uploads.

**Install packages:**
```bash
cd backend
npm install @aws-sdk/client-s3 multer-s3
```

**Replace `backend/config/multer.js` entirely:**
```js
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

// S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// S3 storage for images (guardian photos, assessment files)
const s3Storage = multerS3({
  s3,
  bucket: process.env.AWS_BUCKET_NAME,
  key: (req, file, cb) => {
    cb(null, `uploads/${Date.now()}-${file.originalname}`);
  },
});

// Local disk storage — only for spreadsheet imports (parsed then deleted immediately)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const spreadsheetFilter = (req, file, cb) => {
  const validMimes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ];
  validMimes.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
};

const imageFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith('image/') ||
    (file.mimetype === 'application/octet-stream' &&
      file.originalname.match(/\.(jpg|jpeg|png)$/i))
  ) {
    return cb(null, true);
  }
  cb(new Error(`Invalid file type. Received: ${file.mimetype}. Only image files are allowed.`));
};

// spreadsheetUpload → local disk (file deleted immediately after parsing)
exports.spreadsheetUpload = multer({ storage: diskStorage, fileFilter: spreadsheetFilter });

// imageUpload → S3 (guardian photos, assessment images)
exports.imageUpload = multer({ storage: s3Storage, fileFilter: imageFilter });
```

**Update `backend/controllers/guardianController.js`** — find `uploadPhoto` and change how the path is saved:
```js
exports.uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    // req.file.location is the full S3 URL provided by multer-s3
    const imagePath = req.file.location;
    const guardian = await guardianService.uploadPhoto(req.params.guardianId, imagePath);
    if (!guardian) return res.status(404).json({ message: 'Guardian not found' });
    res.status(200).json({ message: 'Profile photo updated successfully', profilePhoto: imagePath, guardian });
  } catch (err) { next(err); }
};
```

**Update `backend/services/assessmentService.js`** — find `uploadFile` and change the returned URL:
```js
async function uploadFile(file) {
  // file.location is the full S3 URL provided by multer-s3
  return { fileUrl: file.location };
}
```

### 2.4 Commit everything
```bash
git add .
git commit -m "deploy: start script, firebase env var, multer S3 migration"
git push origin main
```

---

## STEP 3 — Heroku

### 3.1 Sign up and install CLI
1. Go to `heroku.com` → sign up
2. Download Heroku CLI from `devcenter.heroku.com/articles/heroku-cli`
3. In your terminal:
```bash
heroku login
```

### 3.2 Create the app
Run from the **root of your repo**:
```bash
heroku create visiosphere-backend
```

### 3.3 Set all Config Vars
Go to Heroku Dashboard → your app → **Settings** → **Reveal Config Vars** and add every row:

| Key | Value |
|-----|-------|
| `MONGO_URI` | your Atlas connection string |
| `JWT_SECRET` | copy from your local `backend/.env` |
| `RESEND_API_KEY` | copy from your local `backend/.env` |
| `AI_SERVICE_TOKEN` | copy from your local `backend/.env` |
| `ALLOWED_ORIGIN` | `https://your-app.vercel.app` ← update after Vercel deploy |
| `NODE_ENV` | `production` |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | the base64 string from Step 2.2 |
| `AWS_ACCESS_KEY_ID` | from Step 1.4 |
| `AWS_SECRET_ACCESS_KEY` | from Step 1.4 |
| `AWS_REGION` | `ap-southeast-1` |
| `AWS_BUCKET_NAME` | `visiosphere-uploads` |

### 3.4 Deploy the backend subfolder
Your repo has `backend/`, `frontend/`, `ai_core/` — Heroku only needs `backend/`:
```bash
git subtree push --prefix backend heroku main
```

If you get a non-fast-forward error on re-deploys:
```bash
git push heroku `git subtree split --prefix backend main`:main --force
```

### 3.5 Verify it's running
```bash
heroku logs --tail
```
You should see:
- `[ENV] All environment variables validated.`
- `Firebase Admin SDK initialized successfully.`
- `Server running on http://0.0.0.0:5000`

Also test in browser:
```
https://visiosphere-backend.herokuapp.com/health
```
Should return JSON with `"message": "OK"`.

---

## STEP 4 — Vercel

### 4.1 Sign up and import project
1. Go to `vercel.com` → **Sign up with GitHub**
2. Click **Add New Project** → select your repo
3. **Set Root Directory to `frontend`** — click Edit next to root directory and type `frontend`
4. Framework preset: **Vite** (auto-detected)

### 4.2 Add environment variables
Add these before clicking Deploy:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://visiosphere-backend.herokuapp.com/api` |
| `VITE_SOCKET_URL` | `https://visiosphere-backend.herokuapp.com` |
| `VITE_STREAM_URL` | `http://192.168.100.x:5001/video_feed` ← your AI core LAN IP |

### 4.3 Deploy
Click **Deploy**. Vercel builds and deploys automatically.

Your app URL will be something like `https://visiosphere-abc123.vercel.app`.

### 4.4 Update ALLOWED_ORIGIN in Heroku
Now that you have your Vercel URL, go back to Heroku Config Vars and update:
```
ALLOWED_ORIGIN = https://visiosphere-abc123.vercel.app
```
Heroku automatically restarts — no redeploy needed.

---

## STEP 5 — Verify Everything Works

Test in this order:

- [ ] `https://visiosphere-backend.herokuapp.com/health` → returns OK
- [ ] Open your Vercel URL → login page loads with no console errors
- [ ] Log in as Admin → dashboard loads
- [ ] Upload a guardian profile photo → confirm it saves and displays (stored in S3)
- [ ] Open the CCTV page from inside the facility LAN → video feeds load
- [ ] Start the AI core (`python cctv_core.py`) → check Heroku logs for Socket.IO connection
- [ ] Trigger an alert → confirm it appears on the dashboard in real time

---

## Quick Reference

**Re-deploy backend after code changes:**
```bash
git subtree push --prefix backend heroku main
```

**View live backend logs:**
```bash
heroku logs --tail
```

**Re-deploy frontend:** push to `main` on GitHub — Vercel auto-deploys.
