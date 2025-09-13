// Backend & Database (JavaScript) - All logic is self-contained in this single file.
// It's like having the frontend and backend together for a simple serverless app.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let userId = null;
let isAuthReady = false;

// UI elements
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const closeMessageBtn = document.getElementById('close-message-btn');

// Function to show a custom message box for errors or notifications
function showMessageBox(message) {
    messageText.textContent = message;
    messageBox.classList.remove('hidden');
    messageBox.classList.add('flex');
}

// Event listener to close the custom message box
closeMessageBtn.addEventListener('click', () => {
    messageBox.classList.remove('flex');
    messageBox.classList.add('hidden');
});

// Function to dynamically add a message to the chat history UI
function addMessageToUI(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;
    const messageBubble = document.createElement('div');
    messageBubble.className = `max-w-[75%] p-4 rounded-lg shadow-sm ${isUser ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`;
    messageBubble.textContent = text;
    messageDiv.appendChild(messageBubble);
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Function to save a message to Firestore
async function saveMessageToDB(text, role) {
    if (!userId) {
        console.error("User ID is not available. Cannot save message.");
        return;
    }
    try {
        await addDoc(collection(db, `/artifacts/${appId}/users/${userId}/messages`), {
            text: text,
            role: role,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error adding document: ", e);
        showMessageBox("Failed to save message to database.");
    }
}

// The main function to send a message and get a response from the AI
async function sendMessage() {
    const prompt = userInput.value.trim();
    if (!prompt || !isAuthReady) {
        return;
    }

    loadingSpinner.classList.remove('hidden');
    sendBtn.disabled = true;
    userInput.disabled = true;

    const userPrompt = prompt;
    userInput.value = '';

    try {
        // Save the user's message to the database first
        await saveMessageToDB(userPrompt, 'user');

        const systemPrompt = "You are a friendly, knowledgeable, and professional career advisor. Your purpose is to provide guidance on career paths, resume writing, interview preparation, and skill development. Be encouraging, provide actionable advice, and always maintain a positive tone. Do not provide advice outside of career topics.";
        
        // Fetch the full chat history for context to send to the AI
        // This is a crucial step for the AI to "remember" the conversation.
        const messagesQuery = await new Promise(resolve => {
            const unsubscribe = onSnapshot(query(collection(db, `/artifacts/${appId}/users/${userId}/messages`), orderBy('timestamp')), (snapshot) => {
                unsubscribe();
                resolve(snapshot);
            }, (error) => {
                console.error("Error fetching chat history:", error);
                resolve(null);
            });
        });
        
        const chatHistoryContent = messagesQuery ? messagesQuery.docs.map(doc => doc.data().text).join('\n') : '';
        const combinedPrompt = `${chatHistoryContent}\n\nUser: ${userPrompt}`;

        // Construct the payload for the Gemini API call
        const payload = {
            contents: [{ parts: [{ text: combinedPrompt }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            }
        };

        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            showMessageBox(`Error from AI: ${errorData.error.message}`);
            return;
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const aiText = candidate.content.parts[0].text;
            // Save the AI's response to the database
            await saveMessageToDB(aiText, 'ai');
        } else {
            showMessageBox("I'm sorry, I couldn't generate a response. Please try again.");
        }
    } catch (error) {
        console.error("Fetch or save error:", error);
        showMessageBox("An error occurred. Please check your network connection and try again.");
    } finally {
        loadingSpinner.classList.add('hidden');
        sendBtn.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}

// Authentication and Firestore Listener Setup
// This is a crucial part of the "backend" logic.
// It signs in the user anonymously and sets up a real-time listener for messages.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        isAuthReady = true;

        // Setup the real-time listener for the user's messages
        // Any time a message is added to the database, this will update the UI
        const messagesQuery = query(collection(db, `/artifacts/${appId}/users/${userId}/messages`), orderBy('timestamp'));
        onSnapshot(messagesQuery, (snapshot) => {
            chatHistory.innerHTML = ''; // Clear existing messages
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                addMessageToUI(data.text, data.role === 'user');
            });
        }, (error) => {
            console.error("Error fetching messages:", error);
            showMessageBox("Failed to load chat history. Please refresh the page.");
        });

        // The input field is now enabled by default. This ensures the app is responsive even
        // before the Firebase connection is fully established.
        sendBtn.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    } else {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            showMessageBox("Failed to sign in. Please try again.");
        }
    }
});

// Event listeners for user interaction
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});