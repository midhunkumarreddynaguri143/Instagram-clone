/**
 * firebase-login.js
 * Handles Firebase Authentication (Email/Password) UI interactions for login.html.
 * Assumes Firebase app is initialized in config.js and HTML elements exist.
 */

console.log("firebase-login.js loaded");

document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements ---
    const loginContainer = document.getElementById('login-container');
    const userInfoDiv = document.getElementById('user-info');
    const userEmailSpan = document.getElementById('user-email');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const signupButton = document.getElementById('signup-button');
    const logoutButton = document.getElementById('logout-button');
    const loginError = document.getElementById('login-error');

    // Ensure elements exist before proceeding
    if (!loginContainer || !userInfoDiv || !userEmailSpan || !emailInput || !passwordInput || !loginButton || !signupButton || !logoutButton || !loginError) {
        console.error("One or more required HTML elements for login are missing!");
        return; // Stop execution if critical elements are missing
    }

    // Get Firebase Auth instance (initialized in config.js)
    const auth = firebase.auth();

    // --- Core Authentication Logic ---

    /**
     * Handles user sign-out.
     */
    function handleLogout() {
        auth.signOut().catch((error) => {
            console.error('Sign out error:', error);
            // Display error? Usually, onAuthStateChanged handles the UI update anyway.
            displayError('Error signing out. Please try again.');
        });
    }

    /**
     * Displays an error message to the user.
     * @param {string} message The error message to display.
     */
    function displayError(message) {
        loginError.textContent = message;
        loginError.style.display = message ? 'block' : 'none'; // Show/hide error element
    }

    /**
     * Clears any displayed error messages.
     */
    function clearError() {
        displayError('');
    }

    /**
     * Updates the UI based on the authentication state.
     * @param {firebase.User | null} user The current user object or null if logged out.
     */
     function updateUI(user) {
        clearError(); // Clear errors when UI state changes
        if (user) {
            // User is signed in
            loginContainer.style.display = 'none';
            userInfoDiv.style.display = 'block';
            userEmailSpan.textContent = user.email || 'No email available';
            // Note: Redirection happens after backend check in onAuthStateChanged
        } else {
            // User is signed out
            loginContainer.style.display = 'block';
            userInfoDiv.style.display = 'none';
            userEmailSpan.textContent = '';
            // Clear sensitive info from local storage on logout
            localStorage.removeItem('userUID');
            localStorage.removeItem('username');
            localStorage.removeItem('profileName');
            // Ensure user is on the login page if logged out
            if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
                console.log("Redirecting to login page because user is logged out.");
                window.location.href = '/login.html';
            }
        }
    }


    // --- Firebase Auth State Listener ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("Auth state changed: User is signed in.", user.uid);
            // User is signed in. Update UI temporarily.
             updateUI(user);

            // Verify token with backend and ensure user model exists (Requirement 4)
            try {
                const idToken = await user.getIdToken(true); // Force refresh if needed
                console.log("Sending token to /api/check_auth");

                const response = await fetch('/api/check_auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ idToken: idToken }),
                });

                const data = await response.json();

                if (!response.ok) {
                    // Backend validation failed
                    console.error("Backend auth check failed:", data.error);
                    displayError(`Authentication check failed: ${data.error || response.statusText}. Logging out.`);
                    handleLogout(); // Log out the user if backend check fails
                } else {
                    // Backend validation successful
                    console.log("Backend auth check successful:", data.message);
                    // Store essential user info from backend response for use across the app
                    localStorage.setItem('userUID', data.uid);
                    localStorage.setItem('username', data.username);
                    localStorage.setItem('profileName', data.profileName); // Store profile name

                    console.log("Redirecting to timeline (index.html)");
                    // Redirect to the main application page
                     // Only redirect if we are currently on the login page
                    if (window.location.pathname === '/login.html' || window.location.pathname === '/') {
                        window.location.href = '/index.html';
                    }
                }
            } catch (error) {
                console.error("Error calling /api/check_auth or getting ID token:", error);
                displayError('Failed to verify authentication with server. Logging out.');
                handleLogout(); // Log out on critical error
            }

        } else {
            // User is signed out.
            console.log("Auth state changed: User is signed out.");
            updateUI(null); // Update UI to show login form
        }
    });


    // --- Event Listeners for Buttons ---

    // Login Button
    loginButton.addEventListener('click', () => {
        clearError();
        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            displayError("Please enter both email and password.");
            return;
        }

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Signed in
                console.log("Login successful via button click", userCredential.user.uid);
                // onAuthStateChanged will handle UI updates and backend check/redirect
            })
            .catch((error) => {
                console.error("Login Error:", error.code, error.message);
                displayError(error.message); // Display Firebase auth error message
            });
    });

    // Sign Up Button
    signupButton.addEventListener('click', () => {
        clearError();
        const email = emailInput.value;
        const password = passwordInput.value;

         if (!email || !password) {
            displayError("Please enter both email and password.");
            return;
        }
        // Basic password validation (optional but recommended)
        if (password.length < 6) {
             displayError("Password should be at least 6 characters long.");
             return;
        }


        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Signed up
                console.log("Signup successful via button click", userCredential.user.uid);
                 // onAuthStateChanged will handle UI updates and backend check/redirect.
                 // The backend check_auth will initialize the user profile on first login.
            })
            .catch((error) => {
                console.error("Signup Error:", error.code, error.message);
                displayError(error.message); // Display Firebase auth error message
            });
    });

    // Logout Button
    logoutButton.addEventListener('click', handleLogout);

}); // End DOMContentLoaded
