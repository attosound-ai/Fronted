import { View, StyleSheet } from "react-native";
import { Link, Stack } from "expo-router";

import { Text } from "@/components/ui/Text";

/**
 * NotFoundScreen - Pantalla 404
 */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text variant="h1">404</Text>
        <Text variant="body" style={styles.message}>
          Esta página no existe
        </Text>
        <Link href="/" style={styles.link}>
          <Text variant="body" style={styles.linkText}>
            Volver al inicio
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    padding: 20,
  },
  message: {
    color: "#888888",
    marginTop: 8,
  },
  link: {
    marginTop: 24,
  },
  linkText: {
    color: "#3B82F6",
  },
});
