import * as Network from 'expo-network';
import { createContext, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../theme/mobileTokens';

const NetworkContext = createContext({ isConnected: true });

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }) {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Initial connectivity check on mount
    Network.getNetworkStateAsync().then((state) => {
      if (mounted) setIsConnected(state.isInternetReachable ?? state.isConnected ?? true);
    });

    // Poll every 5 seconds — expo-network (managed workflow) has no addEventListener
    const interval = setInterval(async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) setIsConnected(state.isInternetReachable ?? state.isConnected ?? true);
      } catch {
        // getNetworkStateAsync can throw on some Android devices; assume connected
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {!isConnected && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            YOU ARE OFFLINE — SHOWING CACHED DATA
          </Text>
        </View>
      )}
      {children}
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.warning,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  bannerText: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
