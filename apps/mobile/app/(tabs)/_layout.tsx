import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { DESIGN_TOKENS } from '@mindlog/shared';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: DESIGN_TOKENS.COLOR_PRIMARY,
        tabBarInactiveTintColor: '#4a5568',
        tabBarStyle: {
          backgroundColor: '#161a27',
          borderTopColor: '#1e2535',
          ...(Platform.OS === 'ios' ? { position: 'absolute' } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => (
            // Simple text emoji icon — replace with IconSymbol in Phase 2
            // when proper icon set is configured
            <TabIcon emoji="🏠" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <TabIcon emoji="📓" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native') as typeof import('react-native');
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}
