import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { CheckCircle, PlusCircle } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { Avatar } from './Avatar';
import { Text } from './Text';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import type { AccountEntry } from '@/stores/accountStore';

interface AccountSwitcherBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  representative: 'Representative',
  creator: 'Creator account',
  listener: 'Listener',
};

export function AccountSwitcherBottomSheet({
  visible,
  onClose,
}: AccountSwitcherBottomSheetProps) {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const switchToAccount = useAccountStore((s) => s.switchToAccount);
  const currentUser = useAuthStore((s) => s.user);
  const [switching, setSwitching] = useState<number | null>(null);

  // The authenticated user is the source of truth for "who is active now".
  // activeAccountId is a SecureStore mirror that may briefly lag behind.
  const currentId = currentUser?.id ?? activeAccountId ?? null;

  const handleSwitch = async (entry: AccountEntry) => {
    if (entry.user.id === currentId) {
      onClose();
      return;
    }
    setSwitching(entry.user.id);
    onClose();
    try {
      await switchToAccount(entry.user.id);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Switch account">
      <View style={styles.list}>
        {accounts.map((entry) => {
          const isActive = entry.user.id === currentId;
          const isSwitching = switching === entry.user.id;

          return (
            <TouchableOpacity
              key={entry.user.id}
              style={[styles.row, isActive && styles.rowActive]}
              onPress={() => handleSwitch(entry)}
              activeOpacity={0.7}
              disabled={isSwitching}
            >
              <View style={isActive ? styles.avatarRingActive : undefined}>
                <Avatar
                  uri={entry.user.avatar}
                  fallbackText={entry.user.username}
                  size="md"
                />
              </View>
              <View style={styles.info}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {entry.user.username}
                </Text>
                <Text style={[styles.role, isActive && styles.roleActive]}>
                  {isActive
                    ? 'Active now'
                    : (ROLE_LABEL[entry.user.role] ?? entry.user.role)}
                </Text>
              </View>
              {isSwitching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : isActive ? (
                <CheckCircle size={22} color="#FFFFFF" strokeWidth={2.25} />
              ) : (
                <View style={styles.ellipseOutline} />
              )}
            </TouchableOpacity>
          );
        })}

        {/* Separator + Add account */}
        <View style={styles.separator} />
        <TouchableOpacity
          style={styles.addRow}
          activeOpacity={0.7}
          onPress={() => {
            onClose();
            router.push('/(auth)/login?mode=add');
          }}
        >
          <PlusCircle size={24} color="#FFFFFF" strokeWidth={2.25} />
          <Text style={styles.addText}>Add account</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 12,
  },
  rowActive: {
    backgroundColor: '#2A2A2A',
  },
  avatarRingActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 100,
  },
  info: {
    flex: 1,
  },
  displayName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
  },
  role: {
    color: '#888888',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
    marginTop: 2,
  },
  roleActive: {
    color: '#FFFFFF',
  },
  separator: {
    height: 1,
    backgroundColor: '#222222',
    marginVertical: 8,
    marginHorizontal: 12,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 12,
  },
  addText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  ellipseOutline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#333333',
  },
});
