import React from 'react';
import { Dimensions } from 'react-native';
import YoutubeIframe from 'react-native-youtube-iframe';

const BREDDE = Dimensions.get('window').width;

function hentYoutubeId(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : url;
}

export default function VideoSpiller({ url }: { url: string }) {
  if (!url) return null;
  const videoId = hentYoutubeId(url);
  const videoHoyde = (BREDDE * 9) / 16;
  return (
    <YoutubeIframe
      height={videoHoyde}
      videoId={videoId}
      play={false}
      webViewProps={{
        injectedJavaScript: `
          var style = document.createElement('style');
          style.innerHTML = '.ytp-endscreen-content { display: none !important; } .ytp-ce-element { display: none !important; }';
          document.head.appendChild(style);
          true;
        `,
      }}
      initialPlayerParams={{
        rel: false,
        modestbranding: true,
        loop: true,
        playlist: videoId,
      }}
    />
  );
}
