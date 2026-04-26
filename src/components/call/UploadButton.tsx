import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CloudUpload } from 'lucide-react-native';
import { COLORS, SPACING } from '@/constants/theme';

interface UploadButtonProps {
  onUpload: () => void;
  disabled: boolean;
  isUploading: boolean;
}

export function UploadButton({ onUpload, disabled, isUploading }: UploadButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={() => {
        console.log('[UploadButton] pressed', { disabled, isUploading });
        onUpload();
      }}
      disabled={disabled || isUploading}
    >
      {isUploading ? (
        <ActivityIndicator size="small" color="#555" />
      ) : (
        <CloudUpload
          size={36}
          color={disabled ? '#555' : COLORS.white}
          strokeWidth={1.75}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    padding: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
