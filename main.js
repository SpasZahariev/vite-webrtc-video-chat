import './style.css'


// import { firestore as FS } from 'firebase/app'
import firebase from 'firebase/app'
import 'firebase/firestore'
// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCf8xB7sf7_YFH5AdONJExdjWGDJPq2QtE",
  authDomain: "vite-webrtc-video-chat.firebaseapp.com",
  projectId: "vite-webrtc-video-chat",
  storageBucket: "vite-webrtc-video-chat.appspot.com",
  messagingSenderId: "104891018859",
  appId: "1:104891018859:web:d0e9895f04be33c9e74b2e"
};

// Initialize Firebase

// if (!firebaseConfig.apps.length) {
// const app = initializeApp(firebaseConfig);
  // firebaseConfig.initializeApp(firebaseConfig);
// }
const app = firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();
// const firestore = getFirestore(app);
// const firestore = FS();




const stunServerConfig = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
}

// Global State
let peerConnection = new RTCPeerConnection(stunServerConfig);
let localSteam = null; //my webcalm
let remoteStream = null; //my friend's webcam


const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');




// 1. Setup media sources
webcamButton.onclick = async () => {
  localSteam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localSteam.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localSteam);
  });

  // Pull tracks from remote stream, add to video stream
  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localSteam;
  remoteVideo.srcObject = remoteStream;
};


// The user who starts a call is the one who makes an offer
// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collection
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');


  // this input field will be populated and I will be able to copy paste it to my friend
  callInput.value = callDoc.id; // firestore will automatically generate an ID here because we are calling a document without an ID


  // peerConnection.setLocalDescription bellow will automatically start generating ice candidates as events. I want to listen on them
  // Get candidates for caller, save to db
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      offerCandidates.add(event.candidate.toJSON());
    }
  }

  // Create offer
  const offerDescription = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });




  // Now we need to listen for the user on the other end to accept our offer
  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    //onSnapshot happens every time our callDoc changes in the firestore Database
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer); // using the answer that my friend wrote to the DB
      peerConnection.setRemoteDescription(answerDescription);
    }
  });


  // We need to listen to the answer document for fetching the ICE handshake that our friend has posted
  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') { // we only care about newly added ICE answers in the DB
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });
};


// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  peerConnection.onicecandidate = event => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));


  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  // we will listen to the offers in the DB and create answers for them locally
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};