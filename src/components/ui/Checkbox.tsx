import { TouchableOpacity, View, StyleSheet, Keyboard } from 'react-native';
import { Check } from 'lucide-react-native';

import { Text } from './Text';

interface CheckboxProps {
  checked: boolean;
  onToggle: (value: boolean) => void;
  label?: string | React.ReactNode;
  error?: string;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onToggle,
  label,
  error,
  disabled = false,
}: CheckboxProps) {
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.container}
        onPress={() => {
          if (disabled) return;
          Keyboard.dismiss();
          onToggle(!checked);
        }}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <View
          style={[
            styles.box,
            checked && styles.boxChecked,
            error && styles.boxError,
            disabled && styles.boxDisabled,
          ]}
        >
          {checked && <Check size={14} color="#000000" strokeWidth={2.25} />}
        </View>

        {label && (
          <View style={styles.labelContainer}>
            {typeof label === 'string' ? (
              <Text variant="small" style={styles.label}>
                {label}
              </Text>
            ) : (
              label
            )}
          </View>
        )}
      </TouchableOpacity>

      {error && (
        <Text variant="small" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  boxError: {
    borderColor: '#EF4444',
  },
  boxDisabled: {
    opacity: 0.5,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    color: '#CCCCCC',
    fontSize: 10,
    lineHeight: 14,
  },
  error: {
    color: '#EF4444',
    marginTop: 4,
    marginLeft: 34,
  },
});
