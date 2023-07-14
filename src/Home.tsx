import React, {useEffect, useRef, useState} from 'react';
import {Box, Button, Container, Flex, Input, Text} from 'native-base';
import SocketIOClient from 'socket.io-client';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCView,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
export function HomeScreen() {
  const mediaConstraints = {
    audio: true,
    video: {
      frameRate: 30,
      facingMode: 'user',
    },
  };

  const [type, setType] = useState('JOIN');
  let remoteRTCMessage = useRef(null);

  const [callerId] = useState(
    Math.floor(100000 + Math.random() * 900000).toString(),
  );
  const [otherUserCallerId, setOtherUserCallerId] = useState('');

  const otherUserId = useRef(null);

  // Stream of local user
  const [localStream, setlocalStream] = useState(null);

  /* When a call is connected, the video stream from the receiver is appended to this state in the stream*/
  const [remoteStream, setRemoteStream] = useState(null);

  // This establishes your WebSocket connection
  const socket = SocketIOClient('http://192.168.29.152:3500', {
    transports: ['websocket'],
    query: {
      callerId,
      /* We have generated this `callerId` in `JoinScreen` implementation */
    },
  });

  /* This creates an WebRTC Peer Connection, which will be used to set local/remote descriptions and offers. */
  const peerConnection = useRef(
    new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302',
        },
        {
          urls: 'stun:stun1.l.google.com:19302',
        },
        {
          urls: 'stun:stun2.l.google.com:19302',
        },
      ],
    }),
  );

  useEffect(() => {
    socket.on('newCall', data => {
      /* This event occurs whenever any peer wishes to establish a call with you. */
      remoteRTCMessage.current = data.rtcMessage;
      otherUserId.current = data.callerId;
      setType('INCOMING_CALL');
    });

    socket.on('callAnswered', data => {
      /* This event occurs whenever remote peer accept the call. */
      remoteRTCMessage.current = data.rtcMessage;
      peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(remoteRTCMessage.current),
      );
      setType('WEBRTC_ROOM');
    });

    socket.on('ICEcandidate', data => {
      /* This event is for exchangin Candidates. */
      let message = data.rtcMessage;

      // When Bob gets a candidate message from Alice, he calls `addIceCandidate` to add the candidate to the remote peer description.

      if (peerConnection.current) {
        peerConnection?.current
          .addIceCandidate(new RTCIceCandidate(message.candidate))
          .then(data => {
            console.log('SUCCESS', data);
          })
          .catch(err => {
            console.log('Error', err);
          });
      }
    });

    let isFront = false;

    /*The MediaDevices interface allows you to access connected media inputs such as cameras and microphones. We ask the user for permission to access those media inputs by invoking the mediaDevices.getUserMedia() method. */
    mediaDevices.enumerateDevices().then(sourceInfos => {
      let videoSourceId;
      for (let i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if (
          sourceInfo.kind == 'videoinput' &&
          sourceInfo.facing == (isFront ? 'user' : 'environment')
        ) {
          videoSourceId = sourceInfo.deviceId;
        }
      }

      mediaDevices
        .getUserMedia({
          audio: true,
          video: {
            mandatory: {
              minWidth: 500, // Provide your own width, height and frame rate here
              minHeight: 300,
              minFrameRate: 30,
            },
            facingMode: isFront ? 'user' : 'environment',
            optional: videoSourceId ? [{sourceId: videoSourceId}] : [],
          },
        })
        .then(stream => {
          // Get local stream!
          setlocalStream(stream);

          // setup stream listening
          peerConnection.current.addStream(stream);
        })
        .catch(error => {
          // Log error
        });
    });

    peerConnection.current.onaddstream = event => {
      setRemoteStream(event.stream);
    };

    // Setup ice handling
    peerConnection.current.onicecandidate = event => {
      if (event.candidate) {
        // Alice sends serialized candidate data to Bob using Socket
        sendICEcandidate({
          calleeId: otherUserId.current,
          rtcMessage: {
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
          },
        });
      } else {
        console.log('End of candidates.');
      }
    };

    return () => {
      socket.off('newCall');
      socket.off('callAnswered');
      socket.off('ICEcandidate');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processCall() {
    // 1. Alice runs the `createOffer` method for getting SDP.
    const sessionDescription = await peerConnection.current.createOffer();

    // 2. Alice sets the local description using `setLocalDescription`.
    await peerConnection.current.setLocalDescription(sessionDescription);

    // 3. Send this session description to Bob uisng socket
    sendCall({
      calleeId: otherUserId.current,
      rtcMessage: sessionDescription,
    });
  }

  async function processAccept() {
    // 4. Bob sets the description, Alice sent him as the remote description using `setRemoteDescription()`
    peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage.current),
    );

    // 5. Bob runs the `createAnswer` method
    const sessionDescription = await peerConnection.current.createAnswer();

    // 6. Bob sets that as the local description and sends it to Alice
    await peerConnection.current.setLocalDescription(sessionDescription);
    console.log('answerCall', {
      callerId: otherUserId.current,
      rtcMessage: sessionDescription,
    });
    answerCall({
      callerId: otherUserId.current,
      rtcMessage: sessionDescription,
    });
  }

  function answerCall(data) {
    socket.emit('answerCall', data);
  }

  function sendCall(data) {
    socket.emit('call', data);
  }

  // eslint-disable-next-line react/no-unstable-nested-components
  const JoinScreen = () => {
    return (
      <Box justifyContent="center" flex="1" p="3">
        <Box
          p="3"
          bg="primary.500"
          shadow={2}
          _text={{color: 'warmGray.50', textAlign: 'center'}}>
          My Caller ID:
          <Text
            fontSize="xl"
            fontWeight="bold"
            color="warmGray.50"
            textAlign="center">
            {callerId}
          </Text>
        </Box>
        <Box
          justifyContent="center"
          mt="10"
          p="5"
          bg="secondary.500"
          shadow={2}>
          <Text
            textAlign="center"
            fontSize="md"
            fontWeight="bold"
            color="warmGray.50"
            mb="5">
            Other User's Caller ID to initiate call
          </Text>
          <Input
            placeholder="Enter Caller ID"
            color="warmGray.50"
            value={otherUserId.current}
            onChangeText={text => {
              otherUserId.current = text;
            }}
          />
          <Button
            onPress={() => {
              processCall();
              setType('OUTGOING_CALL');
            }}
            bg="secondary.800"
            mt="5">
            <Text color="warmGray.50">Initiate Call</Text>
          </Button>
        </Box>
      </Box>
    );
  };

  // eslint-disable-next-line react/no-unstable-nested-components
  const IncomingCallScreen = () => {
    return (
      <Box justifyContent="center" flex="1" p="3">
        <Box
          p="3"
          bg="primary.500"
          shadow={2}
          _text={{color: 'warmGray.50', textAlign: 'center'}}>
          <Text
            fontSize="xl"
            fontWeight="bold"
            color="warmGray.50"
            textAlign="center">
            {otherUserId.current}
          </Text>
          is calling you...
          <Button
            onPress={() => {
              processAccept();
              setType('WEBRTC_ROOM');
            }}
            bg="primary.800"
            mt="5">
            <Text color="warmGray.50">Accept</Text>
          </Button>
        </Box>
      </Box>
    );
  };

  // eslint-disable-next-line react/no-unstable-nested-components
  const OutgoingCallScreen = () => {
    return (
      <Box justifyContent="center" flex="1" p="3">
        <Box
          p="3"
          bg="primary.500"
          shadow={2}
          _text={{color: 'warmGray.50', textAlign: 'center'}}>
          Calling to...
          <Text
            fontSize="xl"
            fontWeight="bold"
            color="warmGray.50"
            textAlign="center">
            {otherUserId.current}
          </Text>
          <Button
            onPress={() => {
              setType('JOIN');
              otherUserId.current = null;
            }}
            bg="primary.800"
            mt="5">
            <Text color="warmGray.50">Disconnect</Text>
          </Button>
        </Box>
      </Box>
    );
  };

  // Destroy WebRTC Connection
  function leave() {
    peerConnection.current.close();
    setlocalStream(null);
    setType('JOIN');
  }

  // eslint-disable-next-line react/no-unstable-nested-components
  const WebrtcRoomScreen = () => {
    return (
      <Box justifyContent="center" flex="1" p="3">
        <Box
          p="3"
          bg="primary.500"
          shadow={2}
          _text={{color: 'warmGray.50', textAlign: 'center'}}>
          {localStream ? (
            <RTCView
              objectFit={'cover'}
              style={{width: '100%', height: 200, backgroundColor: '#050A0E'}}
              streamURL={localStream.toURL()}
            />
          ) : null}
          {remoteStream ? (
            <RTCView
              objectFit={'cover'}
              style={{
                width: '100%',
                height: 200,
                backgroundColor: '#050A0E',
                marginTop: 8,
              }}
              streamURL={remoteStream.toURL()}
            />
          ) : null}
          <Button
            onPress={() => {
              leave();
              setlocalStream(null);
            }}
            bg="primary.800"
            mt="5">
            <Text color="warmGray.50">Leave Call</Text>
          </Button>
        </Box>
      </Box>
    );
  };

  switch (type) {
    case 'JOIN':
      return JoinScreen();
    case 'INCOMING_CALL':
      return IncomingCallScreen();
    case 'OUTGOING_CALL':
      return OutgoingCallScreen();
    case 'WEBRTC_ROOM':
      return WebrtcRoomScreen();
    default:
      return null;
  }
}
