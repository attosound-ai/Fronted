import { useState } from 'react';
import { View, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';

import { Text } from './Text';
import { BottomSheet } from './BottomSheet';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  footer?: React.ReactNode;
}

export function Select({
  label,
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  error,
  footer,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      )}

      <TouchableOpacity
        style={[
          styles.trigger,
          isOpen && styles.triggerFocused,
          error && styles.triggerError,
        ]}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
      >
        <Text
          variant="body"
          style={[styles.triggerText, !selectedOption && styles.placeholderText]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
        >
          {selectedOption?.label ?? placeholder}
        </Text>
        {isOpen ? (
          <ChevronUp size={18} color="#666666" strokeWidth={2.25} />
        ) : (
          <ChevronDown size={18} color="#666666" strokeWidth={2.25} />
        )}
      </TouchableOpacity>

      {error && (
        <Text variant="small" style={styles.error}>
          {error}
        </Text>
      )}

      <BottomSheet visible={isOpen} onClose={() => setIsOpen(false)}>
        <FlatList
          data={options}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.option}
              onPress={() => handleSelect(item.value)}
              activeOpacity={0.7}
            >
              <Text
                variant="body"
                style={[styles.optionText, item.value === value && styles.optionSelected]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.15}
              >
                {item.label}
              </Text>
              {item.value === value && (
                <Check size={20} color="#3B82F6" strokeWidth={2.25} />
              )}
            </TouchableOpacity>
          )}
        />
        {footer}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerFocused: {
    borderColor: '#3B82F6',
  },
  triggerError: {
    borderColor: '#EF4444',
  },
  triggerText: {
    color: '#FFFFFF',
    flex: 1,
  },
  placeholderText: {
    color: '#666666',
  },
  error: {
    color: '#EF4444',
    marginTop: 4,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: {
    color: '#FFFFFF',
  },
  optionSelected: {
    color: '#3B82F6',
  },
});
