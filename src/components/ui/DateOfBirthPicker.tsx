import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { Text } from './Text';

interface DateOfBirthPickerProps {
  label?: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (iso: string) => void;
  error?: string;
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${m}/${d}/${y}`;
}

function toDate(iso: string): Date {
  if (!iso) return new Date(2000, 0, 1);
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date(2000, 0, 1);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DateOfBirthPicker({
  label,
  value,
  onChange,
  error,
}: DateOfBirthPickerProps) {
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');

  const handleChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selectedDate) {
      onChange(toISO(selectedDate));
    }
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      )}

      {Platform.OS === 'android' && (
        <TouchableOpacity
          style={[styles.trigger, error && styles.triggerError]}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.7}
        >
          <Text
            variant="body"
            style={value ? styles.triggerText : styles.triggerPlaceholder}
          >
            {value ? formatDisplay(value) : 'Select date'}
          </Text>
        </TouchableOpacity>
      )}

      {showPicker && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
          themeVariant="dark"
        />
      )}

      {error && (
        <Text variant="small" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  label: {
    marginBottom: 6,
    color: '#AAAAAA',
  },
  trigger: {
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#222222',
  },
  triggerError: {
    borderColor: '#EF4444',
  },
  triggerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
  },
  triggerPlaceholder: {
    color: '#666666',
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
  },
  error: {
    color: '#EF4444',
    marginTop: 4,
  },
});
