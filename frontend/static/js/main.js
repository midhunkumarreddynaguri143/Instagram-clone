// --- Global Variables & Utility Functions ---
let currentUser = null; // Store user info after login check
const MAX_COMMENT_LENGTH = 200; // Match backend limit
const DEFAULT_COMMENT_DISPLAY_COUNT = 5; // Match backend default

// Helper to get ID Token
async function getIdToken() {
    const user = auth.currentUser;
    if (user) {
        try {
            return await user.getIdToken(true); // Force refresh token if needed
        } catch (error) {
            console.error("Error getting ID token:", error);
            // Handle error, maybe redirect to login
            window.location.href = '/login.html';
            return null;
        }
    }
    // Redirect to login if no user
    window.location.href = '/login.html';
    return null;
}

// Helper to make authenticated API calls
async function fetchApi(endpoint, options = {}) {
    const idToken = await getIdToken();
    if (!idToken) return null; // Stop if token retrieval failed

    const defaultHeaders = {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json', // Default, override if needed (e.g., for FormData)
    };

    // Merge headers, allowing override
    options.headers = { ...defaultHeaders, ...options.headers };

    // Adjust Content-Type if body is FormData
    if (options.body instanceof FormData) {
       delete options.headers['Content-Type']; // Browser sets it correctly with boundary
    } else if (options.body && typeof options.body !== 'string') {
        options.body = JSON.stringify(options.body); // Stringify JSON body
    }


    try {
        const response = await fetch(endpoint, options);
        if (!response.ok) {
            // Try to parse error message from backend
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: `HTTP error! Status: ${response.status}` };
            }
            console.error(`API Error (${endpoint}):`, response.status, errorData);
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }
         // Handle cases with no content (e.g., 204 No Content)
        if (response.status === 204) {
            return null; // Or return an empty object/true as needed
        }
        return await response.json(); // Parse JSON response body
    } catch (error) {
        console.error(`Fetch API Error (${endpoint}):`, error);
        // Display error to user? Re-throw?
        alert(`Error: ${error.message || 'An unknown error occurred.'}`); // Simple alert for now
        throw error; // Re-throw to allow caller to handle if needed
    }
}

// Format date nicely (customize as needed)
function formatTimestamp(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        // Example: "Jan 15, 2024" - Adjust format as desired
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
        console.warn("Could not parse date:", isoString);
        return isoString; // Return original string if parsing fails
    }
}

// --- Initialization and Auth Handling ---
document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const path = window.location.pathname;

    // Auth listener to handle page access and setup
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("User is logged in on main.js");
            // Fetch user details from backend/local storage for personalization
            const uid = localStorage.getItem('userUID');
            const username = localStorage.getItem('username');
            const profileName = localStorage.getItem('profileName');

            if (!uid || !username) {
                 // If essential info isn't stored, try calling check_auth again or redirect
                 console.warn("User info missing from local storage, attempting recovery or logout.");
                try {
                     const idToken = await user.getIdToken();
                     const response = await fetch('/api/check_auth', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ idToken: idToken }),
                     });
                     const data = await response.json();
                     if (response.ok) {
                        localStorage.setItem('userUID', data.uid);
                        localStorage.setItem('username', data.username);
                        localStorage.setItem('profileName', data.profileName);
                        currentUser = { uid: data.uid, username: data.username, profileName: data.profileName };
                        initializePage(); // Re-initialize after getting data
                     } else {
                        throw new Error(data.error || 'Failed to verify auth state.');
                     }
                 } catch(error) {
                     console.error("Auth state recovery failed:", error);
                     auth.signOut(); // Log out if recovery fails
                     return;
                 }

            } else {
                 currentUser = { uid, username, profileName };
                 initializePage(); // Setup the page now that we know the user is logged in
            }

        } else {
            console.log("User is logged out on main.js");
            currentUser = null;
            // If not on login page, redirect
            if (path !== '/login.html' && path !== '/') {
                console.log("Redirecting to login page.");
                window.location.href = '/login.html';
            }
        }
    });

    // --- Common Navigation/Header Setup ---
    function setupHeader() {
        const logoutButton = document.getElementById('logout-button');
        const profileLink = document.getElementById('profile-link');
        const searchInput = document.getElementById('search-input');
        const searchResultsDiv = document.getElementById('search-results');

        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                auth.signOut().catch(error => console.error('Logout error:', error));
            });
        }

        if (profileLink && currentUser) {
            profileLink.textContent = currentUser.profileName || currentUser.username; // Display ProfileName or Username
            profileLink.href = `/profile.html?username=${currentUser.username}`; // Link to own profile
        }

         // Search functionality (Requirement 10 & 11)
        if (searchInput && searchResultsDiv) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                const query = searchInput.value.trim();
                if (query.length > 0) { // Only search if query is not empty
                     searchTimeout = setTimeout(async () => {
                        try {
                            const data = await fetchApi(`/api/search/users?q=${encodeURIComponent(query)}`);
                            renderSearchResults(data.results, searchResultsDiv);
                        } catch (error) {
                            console.error("Search failed:", error);
                             searchResultsDiv.innerHTML = '<div>Error searching</div>';
                             searchResultsDiv.style.display = 'block';
                        }
                    }, 300); // Debounce search API calls
                } else {
                     searchResultsDiv.style.display = 'none'; // Hide results if query is empty
                     searchResultsDiv.innerHTML = '';
                }
            });

            // Hide search results when clicking outside
             document.addEventListener('click', (event) => {
                if (!searchResultsDiv.contains(event.target) && event.target !== searchInput) {
                    searchResultsDiv.style.display = 'none';
                }
            });
        }
    }

    function renderSearchResults(results, container) {
         container.innerHTML = ''; // Clear previous results
         if (results && results.length > 0) {
             results.forEach(user => {
                 const div = document.createElement('div');
                 div.textContent = `${user.profileName} (@${user.username})`;
                 div.onclick = () => {
                     window.location.href = `/profile.html?username=${user.username}`;
                 };
                 container.appendChild(div);
             });
             container.style.display = 'block';
         } else {
             container.innerHTML = '<div>No users found</div>';
             container.style.display = 'block';
             // Or hide if no results: container.style.display = 'none';
         }
     }


    // --- Page Specific Initialization ---
    function initializePage() {
        if (!currentUser) return; // Should not happen if called after auth check

        setupHeader(); // Setup header elements common to pages

        // Route based on current page path
        if (path.startsWith('/index.html') || path === '/') {
            initTimelinePage();
        } else if (path.startsWith('/profile.html')) {
            initProfilePage();
        } else if (path.startsWith('/user_list.html')) {
            initUserListPage();
        }
        // Add other page initializations here if needed
    }

    // --- Timeline Page Logic (`index.html`) ---
    function initTimelinePage() {
        console.log("Initializing Timeline Page");
        const postForm = document.getElementById('post-form');
        const postStatus = document.getElementById('post-status');
        const postsContainer = document.getElementById('posts-container');

        // Load timeline feed
        loadTimeline(postsContainer);

        // Handle Post Creation (Requirement 6)
        if (postForm) {
            postForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                postStatus.textContent = 'Creating post...';
                postStatus.style.color = 'black';

                const captionInput = document.getElementById('post-caption');
                const imageInput = document.getElementById('post-image');
                const file = imageInput.files[0];

                if (!file) {
                    postStatus.textContent = 'Please select an image.';
                    postStatus.style.color = 'red';
                    return;
                }
                 if (!['image/png', 'image/jpeg'].includes(file.type)) {
                    postStatus.textContent = 'Invalid file type. Please select PNG or JPG.';
                    postStatus.style.color = 'red';
                    return;
                }

                const formData = new FormData();
                formData.append('caption', captionInput.value);
                formData.append('image', file);

                try {
                    await fetchApi('/api/posts', {
                        method: 'POST',
                        body: formData, // Let fetch set Content-Type for FormData
                         // Remove 'Content-Type': 'application/json' header for FormData
                        headers: { }
                    });
                    postStatus.textContent = 'Post created successfully!';
                    postStatus.style.color = 'green';
                    captionInput.value = ''; // Clear form
                    imageInput.value = '';
                    loadTimeline(postsContainer); // Refresh timeline
                } catch (error) {
                    postStatus.textContent = `Error: ${error.message}`;
                    postStatus.style.color = 'red';
                }
            });
        }
    }

    async function loadTimeline(container) {
        if (!container) return;
        container.innerHTML = '<p>Loading timeline...</p>';
        try {
            const data = await fetchApi('/api/timeline');
            renderPosts(data.posts || [], container);
        } catch (error) {
            container.innerHTML = '<p>Could not load timeline.</p>';
        }
    }


    // --- Profile Page Logic (`profile.html`) ---
    function initProfilePage() {
        console.log("Initializing Profile Page");
        const urlParams = new URLSearchParams(window.location.search);
        const username = urlParams.get('username');

        if (!username) {
             // If no username, redirect to current user's profile
            if (currentUser) {
                window.location.href = `/profile.html?username=${currentUser.username}`;
            } else {
                 // Or handle error / redirect to login if even current user is unknown
                window.location.href = '/login.html';
            }
            return;
        }

        loadProfile(username);
    }

    async function loadProfile(username) {
        const postsContainer = document.getElementById('posts-container');
        const usernameHeader = document.getElementById('profile-username');
        const profileNameP = document.getElementById('profile-profileName');
        const postCountSpan = document.getElementById('profile-post-count');
        const followersCountSpan = document.getElementById('profile-followers-count');
        const followingCountSpan = document.getElementById('profile-following-count');
        const followersLink = document.getElementById('followers-link');
        const followingLink = document.getElementById('following-link');
        const followButton = document.getElementById('follow-button');
        const followStatusP = document.getElementById('follow-status');


        // Clear previous state
         usernameHeader.textContent = 'Loading...';
         profileNameP.textContent = '';
         postCountSpan.textContent = '-';
         followersCountSpan.textContent = '-';
         followingCountSpan.textContent = '-';
         postsContainer.innerHTML = '<p>Loading posts...</p>';
         followButton.style.display = 'none';
         followButton.textContent = 'Follow';
         followButton.classList.remove('following');
         followStatusP.textContent = '';


        try {
            const data = await fetchApi(`/api/users/${username}/profile`);

            usernameHeader.textContent = data.username;
            profileNameP.textContent = data.profileName || data.username; // Show ProfileName
            document.title = `${data.profileName || data.username} - InstaClone`; // Update page title
            postCountSpan.textContent = data.posts.length;
            followersCountSpan.textContent = data.followerCount;
            followingCountSpan.textContent = data.followingCount;

            // Render posts in grid (Requirement 5)
            renderPosts(data.posts || [], postsContainer, true); // Pass true for grid view

             // Setup follow/unfollow button (Requirement 9)
            if (!data.isCurrentUser) {
                followButton.style.display = 'inline-block';
                updateFollowButton(data.isFollowing);
                followButton.onclick = async () => {
                    followStatusP.textContent = 'Processing...';
                     try {
                         const result = await fetchApi(`/api/users/${data.uid}/follow`, { method: 'POST' });
                         updateFollowButton(result.action === 'follow');
                         followersCountSpan.textContent = result.newFollowerCount; // Update count
                         followStatusP.textContent = result.message;
                         setTimeout(() => followStatusP.textContent = '', 3000); // Clear status after a bit
                     } catch(error) {
                          followStatusP.textContent = `Error: ${error.message}`;
                     }
                };
            } else {
                 followButton.style.display = 'none';
            }

             // Setup links for followers/following lists (Requirement 7)
            followersLink.href = `/user_list.html?uid=${data.uid}&type=followers&username=${data.username}`;
            followingLink.href = `/user_list.html?uid=${data.uid}&type=following&username=${data.username}`;


        } catch (error) {
            document.getElementById('profile-page').innerHTML = `<p>Could not load profile for ${username}. ${error.message}</p>`;
        }
    }

    function updateFollowButton(isFollowing) {
         const followButton = document.getElementById('follow-button');
         if (isFollowing) {
             followButton.textContent = 'Following';
             followButton.classList.add('following');
         } else {
             followButton.textContent = 'Follow';
             followButton.classList.remove('following');
         }
     }

     // --- User List Page Logic (followers/following - `user_list.html`) ---
    function initUserListPage() {
         console.log("Initializing User List Page");
         const urlParams = new URLSearchParams(window.location.search);
         const uid = urlParams.get('uid');
         const type = urlParams.get('type'); // 'followers' or 'following'
         const username = urlParams.get('username'); // Username of the profile we came from

         const titleElement = document.getElementById('user-list-title');
         const container = document.getElementById('user-list-container');
         const backLink = document.getElementById('back-to-profile-link');

         if (!uid || !type || !['followers', 'following'].includes(type)) {
             container.innerHTML = '<p>Invalid parameters.</p>';
             return;
         }

         titleElement.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}`; // Capitalize 'Followers' or 'Following'
         document.title = `${titleElement.textContent} - InstaClone`;

         if (username) {
            backLink.href = `/profile.html?username=${username}`;
         } else {
             backLink.style.display = 'none'; // Hide back link if username is unknown
         }


         loadUserList(uid, type, container);
     }

     async function loadUserList(uid, type, container) {
         container.innerHTML = '<p>Loading list...</p>';
         try {
             const data = await fetchApi(`/api/users/${uid}/${type}`); // Calls /api/users/<uid>/followers or /following
             renderUserList(data.users || [], container);
         } catch (error) {
             container.innerHTML = '<p>Could not load user list.</p>';
         }
     }

     function renderUserList(users, container) {
         container.innerHTML = ''; // Clear loading message
         if (users.length === 0) {
             container.innerHTML = '<p>No users to display.</p>';
             return;
         }

         // Requirement 8: Display in reverse chronological order (backend attempts this)
         users.forEach(user => {
             const itemDiv = document.createElement('div');
             itemDiv.classList.add('user-list-item');

             const detailsDiv = document.createElement('div');
             detailsDiv.classList.add('user-details');

             const userLink = document.createElement('a');
             userLink.href = `/profile.html?username=${user.username}`;
             userLink.textContent = user.username;

             const profileNameSpan = document.createElement('span');
              profileNameSpan.textContent = user.profileName || user.username; // Show profile name


             detailsDiv.appendChild(userLink);
             detailsDiv.appendChild(profileNameSpan);

             // Add follow/following button maybe? (Optional enhancement)

             itemDiv.appendChild(detailsDiv);
             container.appendChild(itemDiv);
         });
     }


    // --- Rendering Functions ---

    // Render posts (used by timeline and profile)
    function renderPosts(posts, container, isGridView = false) {
        container.innerHTML = ''; // Clear existing posts or loading message

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p>No posts yet.</p>';
            return;
        }

        posts.forEach(post => {
            const postElement = createPostElement(post, isGridView);
            container.appendChild(postElement);
        });
    }

    // Create HTML element for a single post
    function createPostElement(post, isGridView = false) {
        const div = document.createElement('div');
        div.classList.add('post');
        div.dataset.postId = post.id; // Store post ID for comment actions

        // Header (Username) - Hidden in grid view
        const header = document.createElement('div');
        header.classList.add('post-header');
        if (!isGridView) {
             const userLink = document.createElement('a');
             userLink.href = `/profile.html?username=${post.Username}`;
             userLink.textContent = post.Username;
             header.appendChild(userLink);
        }

        // Image
        const imageDiv = document.createElement('div');
        imageDiv.classList.add('post-image');
        const img = document.createElement('img');
        img.src = post.ImageURL;
        img.alt = `Post by ${post.Username}`;
        img.onerror = () => img.alt = "Image failed to load"; // Basic error handling
        imageDiv.appendChild(img);

        // Content (Caption, Date) - Hidden in grid view
        const content = document.createElement('div');
        content.classList.add('post-content');
        if (!isGridView) {
            const caption = document.createElement('p');
            caption.classList.add('post-caption');
                const userStrong = document.createElement('strong'); // Username before caption
                userStrong.textContent = post.Username;
                 const captionText = document.createTextNode(` ${post.Caption}`); // Add space
            caption.appendChild(userStrong);
            caption.appendChild(captionText);


            const date = document.createElement('p');
            date.classList.add('post-date');
            date.textContent = formatTimestamp(post.Date); // Format the date

            content.appendChild(caption);
            content.appendChild(date);
        }

         // Comments Section - Hidden in grid view
        const commentsSection = document.createElement('div');
        commentsSection.classList.add('comments-section');
        if (!isGridView) {
            renderComments(post.commentsPreview || [], post.totalComments || 0, commentsSection, post.id);
            addCommentForm(commentsSection, post.id);
        }


        div.appendChild(header);
        div.appendChild(imageDiv);
        div.appendChild(content);
         div.appendChild(commentsSection); // Add even if hidden initially

        return div;
    }


    // --- Comment Handling Functions ---

    function renderComments(comments, totalComments, container, postId, showAll = false) {
         // Clear only comments, not the form if it exists
         const existingComments = container.querySelectorAll('.comment, .expand-comments-button, .no-comments');
         existingComments.forEach(el => el.remove());


        if (totalComments === 0) {
            const noCommentsP = document.createElement('p');
            noCommentsP.classList.add('no-comments');
             noCommentsP.textContent = 'No comments yet.';
            container.insertBefore(noCommentsP, container.querySelector('.comment-form')); // Insert before form
            return;
        }

        const displayLimit = DEFAULT_COMMENT_DISPLAY_COUNT;
        const commentsToDisplay = showAll ? comments : comments.slice(0, displayLimit);

         // Requirement 14: Reverse chronological order (backend provides this)
        commentsToDisplay.forEach(comment => {
            const commentDiv = createCommentElement(comment);
            container.insertBefore(commentDiv, container.querySelector('.comment-form')); // Insert before form
        });

        // Requirement 15: Expand button
         if (totalComments > displayLimit && !showAll) {
             const expandButton = document.createElement('button');
             expandButton.classList.add('expand-comments-button');
             expandButton.textContent = `View all ${totalComments} comments`;
             expandButton.onclick = async () => {
                 try {
                     // Fetch all comments when expand is clicked
                     expandButton.textContent = 'Loading...';
                     expandButton.disabled = true;
                     const data = await fetchApi(`/api/posts/${postId}/comments`);
                     renderComments(data.comments, data.totalComments, container, postId, true); // Re-render with all
                 } catch (error) {
                     console.error("Failed to load all comments:", error);
                      expandButton.textContent = 'Error loading comments';
                     // Re-enable after a delay or provide retry?
                     setTimeout(() => {
                         expandButton.textContent = `View all ${totalComments} comments`;
                         expandButton.disabled = false;
                     }, 2000);
                 }
             };
             container.insertBefore(expandButton, container.querySelector('.comment-form')); // Insert before form
         }
    }

    function createCommentElement(comment) {
         const div = document.createElement('div');
         div.classList.add('comment');

         const userStrong = document.createElement('strong');
         userStrong.textContent = comment.Username;

         const textSpan = document.createElement('span');
         textSpan.textContent = ` ${comment.Text}`; // Add space

         // Optionally add timestamp
         const dateSpan = document.createElement('span');
         dateSpan.classList.add('comment-date');
         dateSpan.textContent = formatTimestamp(comment.Date); // Or a relative time


         div.appendChild(userStrong);
         div.appendChild(textSpan);
         // div.appendChild(dateSpan); // Uncomment to show comment date

         return div;
     }


    function addCommentForm(container, postId) {
        // Check if form already exists
        if (container.querySelector('.comment-form')) {
             return;
        }

        const form = document.createElement('form');
        form.classList.add('comment-form');

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add a comment...';
        input.maxLength = MAX_COMMENT_LENGTH; // Requirement 13
        input.required = true;

        const button = document.createElement('button');
        button.type = 'submit';
        button.textContent = 'Post';
        button.disabled = true; // Disabled until text is entered

        input.addEventListener('input', () => {
            button.disabled = input.value.trim().length === 0;
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const commentText = input.value.trim();
            if (!commentText) return;

            button.disabled = true; // Disable during submission
            button.textContent = 'Posting...';

            try {
                 // Requirement 13: Add comment via API
                const result = await fetchApi(`/api/posts/${postId}/comments`, {
                    method: 'POST',
                    body: { text: commentText }
                });

                 // Add the new comment visually immediately
                 const newCommentElement = createCommentElement(result.comment); // Use comment data from response
                // Insert the new comment at the top (since comments are newest first)
                const firstCommentOrExpandButton = container.querySelector('.comment, .expand-comments-button, .no-comments');
                if (firstCommentOrExpandButton) {
                     container.insertBefore(newCommentElement, firstCommentOrExpandButton);
                 } else {
                     // If there were no comments/button (shouldn't happen if form is present), just append
                     container.insertBefore(newCommentElement, form);
                 }
                 // Remove "No comments yet" message if it exists
                const noCommentsP = container.querySelector('.no-comments');
                if (noCommentsP) noCommentsP.remove();


                input.value = ''; // Clear input
                button.disabled = true; // Keep disabled as input is empty
                 button.textContent = 'Post';


            } catch (error) {
                console.error("Failed to add comment:", error);
                 alert(`Error adding comment: ${error.message}`);
                 button.disabled = false; // Re-enable on error
                 button.textContent = 'Post';
            }
        });

        form.appendChild(input);
        form.appendChild(button);
        container.appendChild(form);
    }

}); // End DOMContentLoaded
