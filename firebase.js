// Import the functions you need from the SDKs you need
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBQkSBhfxAOFf94ye9_KaZcUQcwEHa2R3U",
  authDomain: "my-finance-23.firebaseapp.com",
  projectId: "my-finance-23",
  storageBucket: "my-finance-23.firebasestorage.app",
  messagingSenderId: "403477399978",
  appId: "1:403477399978:web:9e80c13d64246fd7f7c3d3",
  measurementId: "G-3V56JP78X3"
};

// Uygulamayı başlat
const app = initializeApp(firebaseConfig);

// Dışarıya aktarıyoruz (Export) - Hatanın sebebi bu satırların olmamasıydı
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);