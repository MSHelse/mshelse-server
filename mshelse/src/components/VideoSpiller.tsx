import React from 'react';
import { View, Dimensions } from 'react-native';
import { colors } from '../theme/colors';

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
    <View style={{ width: '100%', height: videoHoyde, backgroundColor: colors.surface2 }}>
      <iframe
        width="100%"
        height="100%"
        src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&loop=1&playlist=${videoId}`}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </View>
  );
}
