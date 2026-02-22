import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS } from '@mindlog/shared';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  index:    { active: 'today',           inactive: 'today-outline' },
  journal:  { active: 'journal',         inactive: 'journal-outline' },
  insights: { active: 'bar-chart',       inactive: 'bar-chart-outline' },
  profile:  { active: 'person-circle',   inactive: 'person-circle-outline' },
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: DESIGN_TOKENS.COLOR_PRIMARY,
        tabBarInactiveTintColor: '#4a5568',
        tabBarStyle: {
          backgroundColor: '#161a27',
          borderTopColor: '#1e2535',
          borderTopWidth: 1,
          ...(Platform.OS === 'ios' ? { position: 'absolute' } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = TAB_ICONS[route.name];
          const name = focused
            ? (icons?.active ?? 'ellipse')
            : (icons?.inactive ?? 'ellipse-outline');
          return <Ionicons name={name} size={24} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index"    options={{ title: 'Today' }} />
      <Tabs.Screen name="journal"  options={{ title: 'Journal' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
    </Tabs>
  );
}
