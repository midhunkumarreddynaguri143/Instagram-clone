# Simplified Instagram Clone

![Python Version](https://img.shields.io/badge/python-3.8%2B-blue.svg)
![Framework](https://img.shields.io/badge/framework-Flask-red.svg)
![Database](https://img.shields.io/badge/database-Firestore-orange.svg)
![Storage](https://img.shields.io/badge/storage-Google%20Cloud%20Storage-green.svg)
![Authentication](https://img.shields.io/badge/auth-Firebase-yellow.svg)

A simplified replica of Instagram built using Python (Flask) for the backend and standard HTML, CSS, and JavaScript for the frontend. This project integrates Firebase services for authentication, database (Firestore), and image storage (Cloud Storage).

## Features

This project implements the core features based on typical social media functionality:

**Group 1 (Core Setup & Data Models)**
*   ✅ User Authentication (Login/Logout/Signup) via Firebase Email/Password (using `firebase-login.js` pattern).
*   ✅ Firestore Collections: `User` and `Post` defined.
*   ✅ Required Composite Index: `Post` collection indexed on `Username` (Asc) / `Date` (Desc). *(Note: An additional `UserID/Date` index is needed for profile queries)*.
*   ✅ Follower/Following relationship mapping within the `User` model.
*   ✅ User model initialization in Firestore on the first application login.

**Group 2 (Profile & Post Creation)**
*   ✅ User profile page displaying user info and their posts in reverse chronological order (grid layout).
*   ✅ Post creation capability: Users can upload a PNG/JPG image with a caption.
*   ✅ Clickable follower/following counts on profiles linking to dedicated list pages.
*   ✅ Separate page displaying lists of followers or following users.

**Group 3 (Social Interactions & Timeline)**
*   ✅ Follow/Unfollow functionality on other users' profiles.
*   ✅ User search functionality matching the beginning of `ProfileName`.
*   ✅ Clickable search results linking to user profiles.
*   ✅ Main timeline feed displaying the last 50 posts (reverse chronological) from the logged-in user and users they follow.

**Group 4 (Comments & UI)**
*   ✅ Ability for users to add comments (max 200 characters) on posts.
*   ✅ Comments displayed below posts in reverse chronological order, showing the commenter's username.
*   ✅ Display limited to 5 comments initially, with an "Expand" button to show all.
*   ✅ Basic, intuitive UI aiming for ease of use.

*(Optional: Add screenshots here)*

### Screenshots

**(Add screenshots of key pages like Login, Timeline, Profile, Post Creation etc.)**

*   *Login Page:* ![Login Screenshot](https://github.com/user-attachments/assets/96159593-8e0d-4f91-86ce-1d7ec65aa8c7)
*   *Timeline:* ![Timeline Screenshot](https://github.com/user-attachments/assets/b0d49b66-24d4-400c-a1f0-dd9c97522a47)
*   *Profile:* ![Profile Screenshot](https://github.com/user-attachments/assets/adb6fcad-52c9-4179-8652-3c07fd837fef)

## Technology Stack

*   **Backend:**
    *   Python 3.8+
    *   Flask (Web Framework)
    *   Firebase Admin SDK (for interacting with Firebase services)
    *   Pillow (for image validation)
*   **Frontend:**
    *   HTML5
    *   CSS3
    *   Vanilla JavaScript
    *   Firebase JS SDK (v8.x used in examples - for Authentication)
*   **Database:** Google Firestore (NoSQL Document Database)
*   **File Storage:** Google Cloud Storage (for images)
*   **Authentication:** Firebase Authentication (Email/Password)

## Prerequisites

Before you begin, ensure you have the following installed:

*   Python 3.8 or higher
*   `pip` (Python package installer)
*   Git
*   A Google Account to create a Firebase project.

## Setup Instructions

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/midhunkumarreddynaguri143/Instagram-clone
    cd your-repo-name
    ```

2.  **Firebase Project Setup:**
    *   Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
    *   **Enable Services:**
        *   **Authentication:** Enable the "Email/Password" sign-in method.
        *   **Firestore Database:** Create a Firestore database. Start in **Test Mode** for development (***Remember to secure rules before production!***). Choose a location.
        *   **Storage:** Enable Cloud Storage. Use the default **Test Mode** rules initially. Note your bucket name (usually `your-project-id.appspot.com`).
    *   **Get Web App Config:**
        *   In Project Settings > General, scroll down to "Your apps".
        *   Click the Web icon (`</>`) to register a new web app.
        *   Give it a nickname (e.g., "InstaClone Web").
        *   Copy the `firebaseConfig` object provided.
    *   **Get Service Account Key:**
        *   In Project Settings > Service accounts, click "Generate new private key".
        *   Download the JSON file.

3.  **Configure Frontend:**
    *   Paste the copied `firebaseConfig` object into `frontend/static/js/config.js`, replacing the placeholder values.

4.  **Configure Backend:**
    *   Rename the downloaded service account key file to `firebase-service-account-key.json`.
    *   **Move** this `firebase-service-account-key.json` file into the `backend/` directory.
    *   **SECURITY:** Add `backend/firebase-service-account-key.json` to your `.gitignore` file to avoid committing credentials!
    *   Open `backend/app.py` and find the `BUCKET_NAME` variable placeholder (around line 31). Replace `"YOUR_FIREBASE_STORAGE_BUCKET_NAME"` with your actual Firebase Storage bucket name you noted earlier.

5.  **Set up Backend Environment:**
    ```bash
    # Navigate to the backend directory
    cd backend

    # Create a virtual environment
    python -m venv venv

    # Activate the virtual environment
    # Windows:
    # venv\Scripts\activate
    # macOS/Linux:
    source venv/bin/activate

    # Install Python dependencies
    pip install -r requirements.txt
    ```

6.  **Create Firestore Indexes:**
    *   Go back to your Firebase Console > Firestore Database > Indexes > Composite.
    *   Create the following indexes for the `Post` collection (wait for them to build - status should be "Enabled"):
        1.  **Fields:** `Username` (Ascending), `Date` (Descending) | **Scope:** Collection
        2.  **Fields:** `UserID` (Ascending), `Date` (Descending) | **Scope:** Collection

## Running the Application

1.  **Ensure your virtual environment is activated** (you should see `(venv)` in your terminal prompt).
2.  **Make sure you are in the `backend` directory.**
3.  **Start the Flask Server:**
    ```bash
    flask run --host=0.0.0.0 --port=5000
    ```
    *   `--host=0.0.0.0` makes the server accessible on your local network. Use `127.0.0.1` to restrict to your machine only.
    *   `--port=5000` specifies the port.
4.  **Access the Frontend:** Open your web browser and navigate to `http://localhost:5000` (or `http://<your-local-ip>:5000` if accessing from another device on the network). You should see the login page.

## Project Structure
```
instagram_clone/
├── backend/
│ ├── app.py # Main Flask application logic & API routes
│ ├── requirements.txt # Python dependencies
│ └── firebase-service-account-key.json # Firebase Admin SDK credentials (KEEP SECURE!)
│
├── frontend/
│ ├── index.html # Main timeline page
│ ├── login.html # Login/Signup page
│ ├── profile.html # User profile page
│ ├── user_list.html # Followers/Following list page
│ ├── static/
│ │ ├── css/
│ │ │ └── style.css # CSS styles
│ │ └── js/
│ │ ├── firebase-login.js # Handles Firebase auth UI logic
│ │ ├── config.js # Firebase config for frontend JS SDK
│ │ └── main.js # Core frontend JS logic (API calls, rendering)
│
└── .gitignore # Specifies intentionally untracked files
└── README.md # This file
```

## Important Notes

*   **SECURITY RULES:** The Firebase rules used during setup (**Test Mode**) are insecure and allow anyone to read/write your data. **Before deploying or using with real data, you MUST write secure Firestore and Storage rules** to properly protect user data.
*   **Scalability:** The current timeline implementation (fetching posts individually for each followed user) and follower/following list generation may not scale well for users with a very large number of follows/followers. Production applications often use data denormalization or more complex backend aggregation (e.g., using Cloud Functions) for feeds.
*   **Error Handling:** Basic error handling is included, but a production app would require more robust error logging, user feedback, and potential retry mechanisms.
*   **Firebase SDK Versions:** This project was built referencing Firebase JS SDK v8.x syntax. Newer versions (v9+ modular) have different syntax.
*   **Missing Features:** This is a *simplified* clone. Features like Likes, Real-time Updates, Notifications, Stories, DMs, advanced search filtering, etc., are not included.

## License

Distributed under the MIT License. See `LICENSE` file for more information (or choose another appropriate license).

*(Note: If this is purely for a class assignment without intent for broader use, you might state "For educational purposes only.")*
