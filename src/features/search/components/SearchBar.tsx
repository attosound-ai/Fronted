import { useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search, XCircle } from 'lucide-react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      <Search size={18} color="#888" strokeWidth={2.25} style={styles.icon} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#666"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        maxFontSizeMultiplier={1.0}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
          <XCircle size={18} color="#666" strokeWidth={2.25} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  icon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
    padding: 0,
    // Pin the input height. Without this, iOS sizes the TextInput's
    // intrinsic content using the OS font scale BEFORE applying
    // maxFontSizeMultiplier, so under Larger Text the bar grows tall
    // even though the placeholder text is correctly capped.
    height: 22,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
