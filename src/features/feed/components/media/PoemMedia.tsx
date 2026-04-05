import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { LinkedText } from '../LinkedText';
import type { FeedPost } from '@/types/post';

interface PoemMediaProps {
  post: FeedPost;
}

export function PoemMedia({ post }: PoemMediaProps) {
  const [expanded, setExpanded] = useState(false);
  const text = post.description ?? '';
  const isLong = text.length > 300 || text.split('\n').length > 7;

  return (
    <View style={styles.container}>
      {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
      <LinkedText style={styles.body} numberOfLines={expanded ? undefined : 7}>
        {text}
      </LinkedText>
      {isLong && (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.expand}>{expanded ? 'Show less' : 'Show more'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  title: {
    color: '#FFF',
    fontSize: 17,
    fontFamily: 'Archivo_700Bold',
    lineHeight: 24,
    marginBottom: 6,
  },
  body: {
    color: '#E8E8E8',
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
    lineHeight: 23,
  },
  expand: {
    color: '#3B82F6',
    fontSize: 14,
    fontFamily: 'Archivo_500Medium',
    marginTop: 6,
  },
});
