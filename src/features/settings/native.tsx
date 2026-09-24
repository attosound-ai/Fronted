/**
 * Native (SwiftUI) building blocks for the settings screens, so they look and
 * navigate like Apple's Settings app (David, Sep 23 2026): inset grouped
 * lists, rows with an icon square, a value and a chevron that push a screen,
 * toggles, inline pickers with a checkmark, red destructive rows and a
 * native confirmation sheet. Everything here renders inside a Host.
 */
import type { ReactNode } from 'react';
import {
  Button,
  ConfirmationDialog,
  Form,
  HStack,
  Host,
  Image,
  LabeledContent,
  List,
  Picker,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  background,
  defaultScrollAnchor,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  listStyle,
  pickerStyle,
  scrollContentBackground,
  scrollDisabled,
  tag,
} from '@expo/ui/swift-ui/modifiers';

export { Section };

const SECONDARY = '#8E8E93';
const CHEVRON = '#5C5C61';
const INK = '#FFFFFF';

/** A full screen settings form, scrolling on its own. */
export function SettingsForm({ children }: { children: ReactNode }) {
  return (
    <Host style={{ flex: 1 }} colorScheme="dark">
      {/* Build 22 opened the form scrolled to its end; anchor it to the top. */}
      <Form modifiers={[defaultScrollAnchor('top')]}>{children}</Form>
    </Host>
  );
}

/** Inset grouped metrics, measured on David's phone: a row is 44 pt, a titled section adds its header. */
const ROW_HEIGHT = 44;
const SECTION_WITH_TITLE = 46;
const SECTION_PLAIN = 22;
const FOOTER_LINE = 20;
const CARD_EXTRA = 32;
const SLACK = 80;

/** The height a list needs when it cannot scroll on its own. */
export function embeddedHeight(
  sections: { rows: number; title?: boolean; footerLines?: number; card?: boolean }[]
) {
  return (
    sections.reduce(
      (h, s) =>
        h +
        s.rows * ROW_HEIGHT +
        (s.title ? SECTION_WITH_TITLE : SECTION_PLAIN) +
        (s.footerLines ?? 0) * FOOTER_LINE +
        (s.card ? CARD_EXTRA : 0),
      0
    ) + SLACK
  );
}

/**
 * A list embedded in a React Native scroll view: the outer scroll view is what
 * the navigation bar watches, so the large title collapses into the small
 * translucent one exactly like Apple's Settings (David, Sep 23 2026). A SwiftUI
 * list has no intrinsic height (build 20 collapsed it to a 34 pt bar), so the
 * host takes an explicit height and the list's own scrolling is off.
 */
export function EmbeddedSettingsForm({
  children,
  height,
}: {
  children: ReactNode;
  height: number;
}) {
  return (
    <Host style={{ width: '100%', height }} colorScheme="dark">
      <List
        modifiers={[
          listStyle('insetGrouped'),
          scrollDisabled(true),
          scrollContentBackground('hidden'),
        ]}
      >
        {children}
      </List>
    </Host>
  );
}

/** Apple's rounded icon square in front of a row title. */
function IconSquare({ symbol, color }: { symbol: string; color: string }) {
  return (
    <HStack
      modifiers={[frame({ width: 29, height: 29 }), background(color), cornerRadius(7)]}
    >
      <Image systemName={symbol as never} size={15} color="#FFFFFF" />
    </HStack>
  );
}

function Chevron() {
  return <Image systemName={'chevron.right' as never} size={13} color={CHEVRON} />;
}

/**
 * Title on the left (with an optional icon square), value and chevron on the
 * right; pushes a screen or opens a sheet.
 */
export function NavRow({
  title,
  value,
  symbol,
  color = '#636366',
  onPress,
}: {
  title: string;
  value?: string;
  symbol?: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Button
      onPress={onPress}
      modifiers={[accessibilityLabel(value ? `${title}, ${value}` : title)]}
    >
      <HStack spacing={12}>
        {symbol ? <IconSquare symbol={symbol} color={color} /> : null}
        <Text modifiers={[foregroundStyle(INK)]}>{title}</Text>
        <Spacer />
        {value ? <Text modifiers={[foregroundStyle(SECONDARY)]}>{value}</Text> : null}
        <Chevron />
      </HStack>
    </Button>
  );
}

/** A read only row: label on the left, value on the right, no chevron. */
export function ValueRow({
  title,
  value,
  symbol,
  color = '#636366',
  valueColor,
}: {
  title: string;
  value: string;
  symbol?: string;
  color?: string;
  valueColor?: string;
}) {
  return (
    <HStack spacing={12}>
      {symbol ? <IconSquare symbol={symbol} color={color} /> : null}
      <Text>{title}</Text>
      <Spacer />
      <Text modifiers={[foregroundStyle(valueColor ?? SECONDARY)]}>{value}</Text>
    </HStack>
  );
}

/** A plain action row in the accent colour, like "Copy" or "Share" in Apple's lists. */
export function ActionRow({
  title,
  symbol,
  onPress,
  destructive = false,
}: {
  title: string;
  symbol?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Button
      onPress={onPress}
      role={destructive ? 'destructive' : 'default'}
      systemImage={symbol as never}
      label={title}
    />
  );
}

/** The card at the top of Apple's Settings: avatar, name, subtitle, chevron. */
export function ProfileCardRow({
  name,
  subtitle,
  onPress,
}: {
  name: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Button onPress={onPress} modifiers={[accessibilityLabel(name)]}>
      <HStack spacing={14}>
        <Image
          systemName={'person.crop.circle.fill' as never}
          size={54}
          color={SECONDARY}
        />
        <VStack alignment="leading" spacing={2}>
          <Text
            modifiers={[font({ size: 20, weight: 'semibold' }), foregroundStyle(INK)]}
          >
            {name}
          </Text>
          <Text modifiers={[foregroundStyle(SECONDARY), font({ size: 14 })]}>
            {subtitle}
          </Text>
        </VStack>
        <Spacer />
        <Chevron />
      </HStack>
    </Button>
  );
}

export function ToggleRow({
  title,
  isOn,
  onChange,
  symbol,
  color = '#636366',
}: {
  title: string;
  isOn: boolean;
  onChange: (on: boolean) => void;
  symbol?: string;
  color?: string;
}) {
  return (
    <Toggle isOn={isOn} onIsOnChange={onChange}>
      <HStack spacing={12}>
        {symbol ? <IconSquare symbol={symbol} color={color} /> : null}
        <Text>{title}</Text>
      </HStack>
    </Toggle>
  );
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

/** A red row that asks first through the native confirmation sheet. */
export function ConfirmRow({
  title,
  question,
  confirmLabel,
  cancelLabel,
  isPresented,
  onPresentedChange,
  onConfirm,
}: {
  title: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  isPresented: boolean;
  onPresentedChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationDialog
      title={question}
      isPresented={isPresented}
      onIsPresentedChange={onPresentedChange}
      titleVisibility="visible"
    >
      <ConfirmationDialog.Trigger>
        <Button
          role="destructive"
          label={title}
          onPress={() => onPresentedChange(true)}
        />
      </ConfirmationDialog.Trigger>
      <ConfirmationDialog.Actions>
        <Button role="destructive" label={confirmLabel} onPress={onConfirm} />
        <Button
          role="cancel"
          label={cancelLabel}
          onPress={() => onPresentedChange(false)}
        />
      </ConfirmationDialog.Actions>
    </ConfirmationDialog>
  );
}
