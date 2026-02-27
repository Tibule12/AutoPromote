/* eslint-disable react/prop-types */
import React from "react";
import { Player } from "@remotion/player";
import { MyComposition } from "./MyComposition";

const RemotionPlayer = ({ text, color, fontSize }) => {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "300px",
        margin: "0 auto",
        border: "1px solid #ccc",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <Player
        component={MyComposition}
        inputProps={{ text, color, fontSize }}
        durationInFrames={120}
        compositionWidth={1080}
        compositionHeight={1920} // 9:16 Vertical
        fps={30}
        style={{
          width: "100%",
          height: "auto",
          aspectRatio: "9/16",
        }}
        controls
        clickToPlay
      />
    </div>
  );
};

export default RemotionPlayer;
