import React, { useState, FC, useEffect } from 'react'
import VideoContainer from '../components/VideoContainer'
import { Icon, Popup, Button } from 'UI'
import cn from 'classnames'
import Counter from 'App/components/shared/SessionItem/Counter'
import stl from './chatWindow.css'
import ChatControls from '../ChatControls/ChatControls'
import Draggable from 'react-draggable';
import type { LocalStream } from 'Player/MessageDistributor/managers/LocalStream';


export interface Props {
  remoteStream: MediaStream | null,
  localStream: LocalStream | null,
  userId: String,
  endCall: () => void
}

const ChatWindow: FC<Props> = function ChatWindow({ userId, remoteStream, localStream, endCall }) {
  const [localVideoEnabled, setLocalVideoEnabled] = useState(false)
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(false)

  
  useEffect(() => {
    if (!remoteStream) { return }
    const iid = setInterval(() => {
      const settings = remoteStream.getVideoTracks()[0]?.getSettings()
      const isDummyVideoTrack = !!settings ? (settings.width === 2 || settings.frameRate === 0) : true
      console.log(isDummyVideoTrack, settings)
      const shouldBeEnabled = !isDummyVideoTrack
      if (shouldBeEnabled !== localVideoEnabled) {
        setRemoteVideoEnabled(shouldBeEnabled)
      }
    }, 1000)
    return () => clearInterval(iid)
  }, [ remoteStream, localVideoEnabled ])

  const minimize = !localVideoEnabled && !remoteVideoEnabled

  return (
    <Draggable handle=".handle" bounds="body">
      <div
        className={cn(stl.wrapper, "fixed radius bg-white shadow-xl mt-16")}
        style={{ width: '280px' }}
      >
        <div className="handle flex items-center p-2 cursor-move select-none">
          <div className={stl.headerTitle}><b>Meeting</b> {userId}</div>
          <Counter startTime={new Date().getTime() } className="text-sm ml-auto" />          
        </div>
        <div className={cn(stl.videoWrapper, {'hidden' : minimize}, 'relative')}>
          <VideoContainer stream={ remoteStream } />
          <div className="absolute bottom-0 right-0 z-50">
            <VideoContainer stream={ localStream ? localStream.stream : null } muted width={50} />
          </div>
        </div>
        <ChatControls videoEnabled={localVideoEnabled} setVideoEnabled={setLocalVideoEnabled} stream={localStream} endCall={endCall} />
      </div>
    </Draggable>
  )
}

export default ChatWindow
