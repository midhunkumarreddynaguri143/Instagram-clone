import os
import datetime
import uuid # For unique image filenames
from flask import Flask, request, jsonify, send_from_directory
from google.cloud import firestore, storage
import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore, auth, storage as admin_storage
from werkzeug.utils import secure_filename # For handling filenames
from PIL import Image # For image validation
import io # For handling image data in memory

# --- Firebase Admin SDK Initialization ---
try:
    cred = credentials.Certificate("firebase-service-account-key.json")
    firebase_admin.initialize_app(cred, {
        'storageBucket': "instagram-clone-4d00d.firebasestorage.app" # Will be determined below or replace with your bucket name
    })
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase Admin SDK: {e}")
    # Decide how to handle this - exit, log, etc.
    exit() # Exit if Firebase admin can't initialize

# Get Firestore client and Storage bucket
db = admin_firestore.client()

# Determine storage bucket name automatically (preferred)
try:
    # Attempt to get the default bucket associated with the project
    bucket = admin_storage.bucket()
    if not bucket.name:
        # Fallback: Manually enter bucket name if auto-detection fails
        # Find your bucket name in Firebase Console -> Storage -> Files tab (it's like your-project-id.appspot.com)
        BUCKET_NAME = "instagram-clone-4d00d.firebasestorage.app" # <--- *** REPLACE THIS ***
        print(f"Warning: Couldn't auto-detect bucket name. Using manually set name: {BUCKET_NAME}")
        if BUCKET_NAME == "instagram-clone-4d00d.firebasestorage.app":
             print("ERROR: You MUST set your Firebase Storage bucket name in backend/app.py")
             exit()
        bucket = admin_storage.bucket(BUCKET_NAME)
    print(f"Using storage bucket: {bucket.name}")
except Exception as e:
    print(f"Error getting storage bucket: {e}. Make sure Storage is enabled in Firebase.")
    exit()


# --- Flask App Initialization ---
app = Flask(__name__, static_folder='../frontend', static_url_path='')

# --- Configuration ---
# Max comment length
MAX_COMMENT_LENGTH = 200
# Allowed image extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
# Timeline post limit
TIMELINE_LIMIT = 50
# Default comments to show
DEFAULT_COMMENT_DISPLAY_COUNT = 5

# --- Helper Functions ---

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def verify_firebase_token(id_token):
    """Verifies the Firebase ID token."""
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        print(f"Error verifying Firebase token: {e}")
        return None

def get_user_data(uid):
    """Retrieves user data from Firestore."""
    user_ref = db.collection('User').document(uid)
    user_doc = user_ref.get()
    if user_doc.exists:
        return user_doc.to_dict()
    return None

def initialize_user_models(uid, username, email, profile_name=None):
    """Initializes user data in Firestore if it doesn't exist."""
    user_ref = db.collection('User').document(uid)
    if not user_ref.get().exists:
        print(f"Initializing user model for UID: {uid}, Username: {username}")
        user_data = {
            'Username': username, # Often same as email initially, or a generated one
            'Email': email,
            'ProfileName': profile_name if profile_name else username, # Use username if no profile name
            'Following': [], # List of UIDs the user follows
            'Followers': [], # List of UIDs following this user
            'CreatedAt': admin_firestore.SERVER_TIMESTAMP
        }
        user_ref.set(user_data)
        return True
    return False

def upload_image_to_gcs(image_file, user_uid):
    """Uploads an image file to Google Cloud Storage."""
    if not image_file or not allowed_file(image_file.filename):
        raise ValueError("Invalid or missing image file.")

    try:
        # Validate image format using Pillow
        img = Image.open(image_file)
        img_format = img.format.lower()
        if img_format not in ['png', 'jpeg']:
            raise ValueError(f"Invalid image format: {img_format}. Only PNG and JPG/JPEG allowed.")

        # Reset stream position after reading with Pillow
        image_file.seek(0)

        # Create a unique filename
        ext = image_file.filename.rsplit('.', 1)[1].lower()
        filename = f"posts/{user_uid}/{uuid.uuid4()}.{ext}"

        blob = bucket.blob(filename)

        # Set content type explicitly for proper display in browser
        content_type = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'

        blob.upload_from_file(image_file, content_type=content_type)

        # Make the blob publicly readable (adjust permissions as needed for your app)
        # Consider using signed URLs for more control in production
        blob.make_public()

        return blob.public_url
    except Exception as e:
        print(f"Error uploading image: {e}")
        raise

# --- API Routes ---

@app.route('/')
def serve_index():
    # Serves login.html if not authenticated, index.html otherwise
    # Logic to check auth state should primarily be in frontend JS
    # This route can just serve the initial landing/login page
    return send_from_directory('../frontend', 'login.html')

@app.route('/<path:filename>')
def serve_static(filename):
    # General static file serving (CSS, JS, other HTML pages)
     return send_from_directory('../frontend', filename)


@app.route('/api/check_auth', methods=['POST'])
def check_auth():
    """
    Endpoint called by frontend on load/login.
    Verifies token and initializes user if needed.
    """
    data = request.get_json()
    id_token = data.get('idToken')
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 400

    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid or expired token"}), 401

    uid = decoded_token['uid']
    email = decoded_token.get('email') # Email might not always be present
    username = email.split('@')[0] if email else f"user_{uid[:5]}" # Simple username generation

    # Attempt to get existing user data
    user_data = get_user_data(uid)

    if not user_data:
        # Requirement 4: Initialize models on first login
        profile_name = decoded_token.get('name', username) # Use Firebase display name if available
        initialize_user_models(uid, username, email, profile_name)
        user_data = get_user_data(uid) # Re-fetch after creation

    if not user_data:
         return jsonify({"error": "Failed to get or initialize user data"}), 500


    # Return necessary user info to frontend
    return jsonify({
        "uid": uid,
        "username": user_data.get('Username'),
        "profileName": user_data.get('ProfileName'),
        "email": user_data.get('Email'),
        "message": "User authenticated and initialized if needed."
    }), 200


@app.route('/api/posts', methods=['POST'])
def create_post():
    """
    Creates a new post with image and caption.
    Requires authentication.
    """
    # 1. Verify Authentication
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Unauthorized"}), 401
    uid = decoded_token['uid']

    # 2. Check Request Data
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
    if 'caption' not in request.form:
         return jsonify({"error": "No caption provided"}), 400

    image_file = request.files['image']
    caption = request.form['caption']

    # 3. Validate Image and Upload to GCS
    try:
        image_url = upload_image_to_gcs(image_file, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"GCS Upload Error: {e}")
        return jsonify({"error": "Failed to upload image"}), 500

    # 4. Get User Info
    user_data = get_user_data(uid)
    if not user_data:
        # This shouldn't happen if check_auth worked, but handle defensively
        return jsonify({"error": "User data not found"}), 404
    username = user_data.get('Username')

    # 5. Save Post to Firestore
    try:
        post_ref = db.collection('Post').document()
        post_data = {
            'UserID': uid,
            'Username': username, # Required field
            'ImageURL': image_url,
            'Caption': caption,
            'Date': admin_firestore.SERVER_TIMESTAMP, # Required field
            'Likes': [], # List of UIDs who liked it
            'Comments': [] # We might store comments as a subcollection later for scalability
        }
        post_ref.set(post_data)
        return jsonify({"message": "Post created successfully", "postId": post_ref.id}), 201
    except Exception as e:
        print(f"Firestore Error creating post: {e}")
        # Consider deleting the uploaded image if Firestore write fails (cleanup)
        # blob = bucket.blob(image_url.split(f"{bucket.name}/")[-1]) # Extract filename
        # if blob.exists(): blob.delete()
        return jsonify({"error": "Failed to save post data"}), 500

@app.route('/api/users/<target_username>/profile', methods=['GET'])
def get_user_profile(target_username):
    """Gets profile information and posts for a given username."""
    # No strict auth needed to view profiles, but could add if needed
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    viewer_decoded_token = verify_firebase_token(id_token) # Get viewer UID if logged in
    viewer_uid = viewer_decoded_token['uid'] if viewer_decoded_token else None


    # 1. Find user by Username
    users_ref = db.collection('User')
    query = users_ref.where('Username', '==', target_username).limit(1)
    results = list(query.stream())

    if not results:
        return jsonify({"error": "User not found"}), 404

    target_user_doc = results[0]
    target_user_data = target_user_doc.to_dict()
    target_uid = target_user_doc.id

    # 2. Get User's Posts (Reverse Chronological)
    posts_ref = db.collection('Post')
    # Using the composite index Username (asc), Date (desc)
    query = posts_ref.where('UserID', '==', target_uid).order_by('Date', direction=admin_firestore.Query.DESCENDING)
    posts = []
    for doc in query.stream():
        post_data = doc.to_dict()
        post_data['id'] = doc.id
        # Convert Firestore timestamp to ISO format string for JSON serialization
        if isinstance(post_data.get('Date'), datetime.datetime):
             post_data['Date'] = post_data['Date'].isoformat() + 'Z' # Add Z for UTC indication
        posts.append(post_data)

    # 3. Determine follow status (if viewer is logged in)
    is_following = False
    if viewer_uid and viewer_uid != target_uid:
        viewer_data = get_user_data(viewer_uid)
        if viewer_data and target_uid in viewer_data.get('Following', []):
            is_following = True


    profile_data = {
        'uid': target_uid,
        'username': target_user_data.get('Username'),
        'profileName': target_user_data.get('ProfileName'),
        'followerCount': len(target_user_data.get('Followers', [])),
        'followingCount': len(target_user_data.get('Following', [])),
        'posts': posts,
        'isCurrentUser': viewer_uid == target_uid if viewer_uid else False,
        'isFollowing': is_following
    }

    return jsonify(profile_data), 200

@app.route('/api/users/<target_uid>/follow', methods=['POST'])
def follow_user(target_uid):
    """Follows or unfollows a user."""
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Unauthorized"}), 401
    current_uid = decoded_token['uid']

    if current_uid == target_uid:
        return jsonify({"error": "Cannot follow yourself"}), 400

    # Use a transaction to ensure atomicity
    @admin_firestore.transactional
    def update_follow_status(transaction, current_user_ref, target_user_ref):
        current_user_snapshot = current_user_ref.get(transaction=transaction).to_dict()
        target_user_snapshot = target_user_ref.get(transaction=transaction).to_dict()

        current_following = current_user_snapshot.get('Following', [])
        target_followers = target_user_snapshot.get('Followers', [])

        action = "follow" # Default action

        if target_uid in current_following:
            # Unfollow
            action = "unfollow"
            current_following.remove(target_uid)
            if current_uid in target_followers: # Should always be true if following state is consistent
                 target_followers.remove(current_uid)
        else:
            # Follow
            current_following.append(target_uid)
            target_followers.append(current_uid)

        # Update documents within the transaction
        transaction.update(current_user_ref, {'Following': current_following})
        transaction.update(target_user_ref, {'Followers': target_followers})
        return action # Return the action performed

    current_user_ref = db.collection('User').document(current_uid)
    target_user_ref = db.collection('User').document(target_uid)

    try:
        # Check if target user exists before transaction
        if not target_user_ref.get().exists:
             return jsonify({"error": "Target user not found"}), 404

        transaction = db.transaction()
        action_result = update_follow_status(transaction, current_user_ref, target_user_ref)

        # Fetch updated counts (optional, could be done on frontend)
        updated_target_data = target_user_ref.get().to_dict()
        new_follower_count = len(updated_target_data.get('Followers', []))

        return jsonify({
            "message": f"Successfully {action_result}ed user.",
            "action": action_result,
            "newFollowerCount": new_follower_count
        }), 200
    except Exception as e:
        print(f"Error during follow/unfollow transaction: {e}")
        return jsonify({"error": "Failed to update follow status"}), 500


@app.route('/api/users/<user_uid>/followers', methods=['GET'])
@app.route('/api/users/<user_uid>/following', methods=['GET'])
def get_follow_list(user_uid):
    """Gets the list of followers or following for a user."""
    list_type = 'Followers' if 'followers' in request.path else 'Following'

    user_ref = db.collection('User').document(user_uid)
    user_doc = user_ref.get()

    if not user_doc.exists:
        return jsonify({"error": "User not found"}), 404

    user_data = user_doc.to_dict()
    uids_list = user_data.get(list_type, [])

    if not uids_list:
        return jsonify({"users": []}), 200

    # Fetch user details for each UID in the list
    # Note: Firestore 'in' query is limited to 10 items. For larger lists, fetch individually or structure data differently.
    # Fetching individually here for simplicity, but can be inefficient.
    user_details = []
    users_ref = db.collection('User')
    fetched_users = {} # Cache fetched users to avoid duplicates if needed

    # Firestore doesn't guarantee order from get_all or 'in' query.
    # If reverse chronological order of *following* is needed, you'd need
    # to store timestamps alongside the UIDs in the Following/Followers arrays,
    # or use subcollections. For simplicity, we return based on UID list order.

    # Simple approach: fetch details for each UID
    for uid in uids_list:
         if uid not in fetched_users:
             doc = users_ref.document(uid).get()
             if doc.exists:
                 data = doc.to_dict()
                 fetched_users[uid] = {
                     "uid": uid,
                     "username": data.get('Username'),
                     "profileName": data.get('ProfileName')
                 }

    # Create the final list based on the original UID order
    for uid in uids_list:
        if uid in fetched_users:
             user_details.append(fetched_users[uid])

    # Requirement 8: Reverse chronological order.
    # THIS IS DIFFICULT with the current simple array model.
    # To achieve true reverse chronological order of *when they were followed*,
    # you would need to store this timestamp information.
    # E.g., 'Following': [{'uid': '...', 'followedAt': timestamp}, ...]
    # Or use a subcollection 'FollowingLog' with documents per follow action.
    # For this example, we'll just reverse the *current* list, which isn't truly chronological.
    user_details.reverse()

    return jsonify({"users": user_details, "listType": list_type.lower()}), 200


@app.route('/api/search/users', methods=['GET'])
def search_users():
    """Searches users by the beginning of their ProfileName."""
    query_param = request.args.get('q', '')
    if not query_param or len(query_param) < 1: # Adjust min length if needed
        return jsonify({"results": []}), 200

    # Firestore prefix search requires >= and < trick
    end_query = query_param + '\uf8ff' # \uf8ff is a very high code point character

    users_ref = db.collection('User')
    query = users_ref.where('ProfileName', '>=', query_param)\
                     .where('ProfileName', '<', end_query)\
                     .order_by('ProfileName')\
                     .limit(10) # Limit search results

    results = []
    for doc in query.stream():
        data = doc.to_dict()
        results.append({
            "uid": doc.id,
            "username": data.get('Username'),
            "profileName": data.get('ProfileName')
        })

    return jsonify({"results": results}), 200

@app.route('/api/timeline', methods=['GET'])
def get_timeline():
    """Gets the timeline feed for the logged-in user."""
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Unauthorized"}), 401
    current_uid = decoded_token['uid']

    user_data = get_user_data(current_uid)
    if not user_data:
        return jsonify({"error": "User not found"}), 404

    following_uids = user_data.get('Following', [])
    uids_to_query = following_uids + [current_uid] # Include user's own posts

    if not uids_to_query:
        return jsonify({"posts": []}), 200

    # Firestore 'in' query is limited to 10 items. If a user follows more than 9 people,
    # this query will fail. Need multiple queries or a different approach for scalability.
    # Approach 1: Multiple 'in' queries (chunking uids_to_query)
    # Approach 2: Maintain a denormalized "timeline" collection per user (more complex write logic)
    # Approach 3: Fetch user's posts + Fetch posts for each followed user separately (simpler but potentially many reads)

    # Using Approach 3 for simplicity here, but acknowledge limitations.
    all_posts = []
    posts_ref = db.collection('Post')

    # Fetch user's own posts
    user_posts_query = posts_ref.where('UserID', '==', current_uid)\
                                .order_by('Date', direction=admin_firestore.Query.DESCENDING)\
                                .limit(TIMELINE_LIMIT) # Apply limit early if possible
    for doc in user_posts_query.stream():
         post = doc.to_dict()
         post['id'] = doc.id
         if isinstance(post.get('Date'), datetime.datetime):
             post['Date'] = post['Date'].isoformat() + 'Z'
         all_posts.append(post)


    # Fetch posts from followed users
    # Be mindful of read costs here!
    for followed_uid in following_uids:
         followed_posts_query = posts_ref.where('UserID', '==', followed_uid)\
                                       .order_by('Date', direction=admin_firestore.Query.DESCENDING)\
                                       .limit(TIMELINE_LIMIT) # Limit per user to avoid overwhelming results
         for doc in followed_posts_query.stream():
             post = doc.to_dict()
             post['id'] = doc.id
             if isinstance(post.get('Date'), datetime.datetime):
                post['Date'] = post['Date'].isoformat() + 'Z'
             # Avoid adding duplicates if a post somehow matches multiple criteria (shouldn't happen here)
             if post['id'] not in [p['id'] for p in all_posts]:
                  all_posts.append(post)


    # Sort all collected posts by date (descending) in Python
    # Ensure date is comparable (use datetime objects or ISO strings)
    all_posts.sort(key=lambda x: x['Date'], reverse=True)

    # Apply the final timeline limit
    timeline_posts = all_posts[:TIMELINE_LIMIT]

    # Add comment snippets (optional, can be fetched separately on frontend)
    for post in timeline_posts:
        # Fetch latest comments for preview (demonstrates subcollection idea)
        comments_data = get_post_comments_internal(post['id'], DEFAULT_COMMENT_DISPLAY_COUNT)
        post['commentsPreview'] = comments_data.get('comments', [])
        post['totalComments'] = comments_data.get('totalComments', 0)


    return jsonify({"posts": timeline_posts}), 200


# --- Comment Routes ---

# Internal helper to fetch comments (used by timeline and dedicated route)
def get_post_comments_internal(post_id, limit=None):
    """Fetches comments for a post, ordered by date desc."""
    comments_ref = db.collection('Post').document(post_id).collection('Comments')
    query = comments_ref.order_by('Date', direction=admin_firestore.Query.DESCENDING)

    # Get total count *before* applying limit for preview
    total_comments_snapshot = query.get() # Get all comment documents for counting
    total_comments = len(total_comments_snapshot)

    if limit:
        query = query.limit(limit)

    comments = []
    for doc in query.stream():
        comment_data = doc.to_dict()
        comment_data['id'] = doc.id
        if isinstance(comment_data.get('Date'), datetime.datetime):
            comment_data['Date'] = comment_data['Date'].isoformat() + 'Z'
        comments.append(comment_data)

    return {"comments": comments, "totalComments": total_comments}


@app.route('/api/posts/<post_id>/comments', methods=['POST'])
def add_comment(post_id):
    """Adds a comment to a specific post."""
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Unauthorized"}), 401
    uid = decoded_token['uid']

    data = request.get_json()
    comment_text = data.get('text')

    if not comment_text:
        return jsonify({"error": "Comment text cannot be empty"}), 400
    if len(comment_text) > MAX_COMMENT_LENGTH:
        return jsonify({"error": f"Comment exceeds maximum length of {MAX_COMMENT_LENGTH} characters"}), 400

    user_data = get_user_data(uid)
    if not user_data:
        return jsonify({"error": "User not found"}), 404
    username = user_data.get('Username')

    # Store comments in a subcollection for better querying and scalability
    post_ref = db.collection('Post').document(post_id)
    if not post_ref.get().exists:
         return jsonify({"error": "Post not found"}), 404

    comment_ref = post_ref.collection('Comments').document()
    comment_data = {
        'UserID': uid,
        'Username': username,
        'Text': comment_text,
        'Date': admin_firestore.SERVER_TIMESTAMP
    }

    try:
        comment_ref.set(comment_data)
        # Prepare the comment data to return to the frontend immediately
        # Convert server timestamp potentially before returning, or handle on frontend
        new_comment = comment_data.copy()
        new_comment['id'] = comment_ref.id
        # Simulate timestamp conversion for immediate display
        new_comment['Date'] = datetime.datetime.now(datetime.timezone.utc).isoformat() + 'Z'

        return jsonify({"message": "Comment added successfully", "comment": new_comment}), 201
    except Exception as e:
        print(f"Error adding comment: {e}")
        return jsonify({"error": "Failed to add comment"}), 500


@app.route('/api/posts/<post_id>/comments', methods=['GET'])
def get_all_comments(post_id):
    """Gets all comments for a specific post."""
    # No auth needed typically to view comments, but can be added
    post_ref = db.collection('Post').document(post_id)
    if not post_ref.get().exists:
         return jsonify({"error": "Post not found"}), 404

    comments_data = get_post_comments_internal(post_id) # No limit

    return jsonify(comments_data), 200


# --- Main Execution ---
if __name__ == '__main__':
    # Use environment variables for port in production
    port = int(os.environ.get('PORT', 5000))
    # Debug=True auto-reloads, but disable in production
    app.run(host='0.0.0.0', port=port, debug=True)
