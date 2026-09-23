/**
 * Native (SwiftUI) building blocks for the settings screens, so they look and
 * navigate like Apple's Settings app (David, Sep 23 2026): inset grouped
 * lists, rows with a value and a chevron that push a screen, toggles, and
 * inline pickers with a checkmark. Everything here renders inside a Host.
 */
import type { ReactNode } from 'react';
import {
  Button,
  Form,
  HStack,
  Host,
  Image,
  LabeledContent,
  Picker,
  Section,
  Spacer,
  Text,
  Toggle,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  foregroundStyle,
  pickerStyle,
  scrollContentBackground,
  scrollDisabled,
  tag,
} from '@expo/ui/swift-ui/modifiers';

export { Section };

const SECONDARY = '#8E8E93';

/** A full screen settings form, scrolling on its own. */
export function SettingsForm({ children }: { children: ReactNode }) {
  return (
    <Host style={{ flex: 1 }} colorScheme="dark">
      <Form>{children}</Form>
    </Host>
  );
}

/**
 * A form embedded in another scroll view (the profile): sized to its content
 * and with its own scrolling off, so the outer list keeps the gesture.
 */
export function EmbeddedSettingsForm({ children }: { children: ReactNode }) {
  return (
    <Host matchContents style={{ width: '100%' }} colorScheme="dark">
      <Form modifiers={[scrollDisabled(true), scrollContentBackground('hidden')]}>
        {children}
      </Form>
    </Host>
  );
}

/** Title on the left, current value and a chevron on the right; pushes a screen. */
export function NavRow({
  title,
  value,
  systemImage,
  onPress,
}: {
  title: string;
  value?: string;
  systemImage?: string;
  onPress: () => void;
}) {
  return (
    <Button onPress={onPress} modifiers={[buttonStyle('plain')]}>
      <LabeledContent label={title}>
        <HStack spacing={6}>
          {value ? <Text modifiers={[foregroundStyle(SECONDARY)]}>{value}</Text> : null}
          <Image
            systemName={(systemImage ?? 'chevron.right') as never}
            size={13}
            color={SECONDARY}
          />
        </HStack>
      </LabeledContent>
    </Button>
  );
}

export function ToggleRow({
  title,
  isOn,
  onChange,
}: {
  title: string;
  isOn: boolean;
  onChange: (on: boolean) => void;
}) {
  return <Toggle label={title} isOn={isOn} onIsOnChange={onChange} />;
}

/** Inline picker rows with a checkmark, like Settings > General > Language. */
export function ChoiceList<T extends string>({
  selection,
  options,
  onChange,
}: {
  selection: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Picker
      selection={selection}
      onSelectionChange={(v) => onChange(v as T)}
      modifiers={[pickerStyle('inline')]}
    >
      {options.map((o) => (
        <Text key={o.value} modifiers={[tag(o.value)]}>
          {o.label}
        </Text>
      ))}
    </Picker>
  );
}

export function FooterText({ children }: { children: string }) {
  return <Text modifiers={[foregroundStyle(SECONDARY)]}>{children}</Text>;
}

export function RowSpacer() {
  return <Spacer />;
}
