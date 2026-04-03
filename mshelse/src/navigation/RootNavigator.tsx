import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { colors } from '../theme/colors';
import InnloggingScreen from '../screens/auth/InnloggingScreen';
import RegistreringScreen from '../screens/auth/RegistreringScreen';
import VelkomstScreen from '../screens/auth/VelkomstScreen';
import HjemScreen from '../screens/main/HjemScreen';
import BiblioteKScreen from '../screens/main/BiblioteKScreen';
import ProgramScreen from '../screens/main/ProgramScreen';
import TrackingScreen from '../screens/main/TrackingScreen';
import KartleggingScreen from '../screens/main/KartleggingScreen';
import ProfilScreen from '../screens/main/ProfilScreen';
import OvelseDetaljScreen from '../screens/main/OvelseDetaljScreen';
import AdminOvelseScreen from '../screens/main/AdminOvelseScreen';
import AdminPanelScreen from '../screens/main/AdminPanelScreen';
import AktivOktScreen from '../screens/main/AktivOktScreen';
import ProgramBuilderScreen from '../screens/main/ProgramBuilderScreen';
import ProgramDetaljScreen from '../screens/main/ProgramDetaljScreen';
import ReassessmentScreen from '../screens/main/ReassessmentScreen';
import KartleggingDetaljScreen from '../screens/main/KartleggingDetaljScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={s.icon}>
      <Text style={[s.label, focused && s.labelActive]}>{name.toUpperCase()}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: s.tabBar, tabBarShowLabel: false }}>
      <Tab.Screen name="Hjem" component={HjemScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon name="Hjem" focused={focused} /> }} />
      <Tab.Screen name="Bibliotek" component={BiblioteKScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon name="Bibliotek" focused={focused} /> }} />
      <Tab.Screen name="Program" component={ProgramScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon name="Program" focused={focused} /> }} />
      <Tab.Screen name="Tracking" component={TrackingScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon name="Tracking" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Kartlegging" component={KartleggingScreen} />
      <Stack.Screen name="Profil" component={ProfilScreen} />
      <Stack.Screen name="OvelseDetalj" component={OvelseDetaljScreen} />
      <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
      <Stack.Screen name="AdminOvelse" component={AdminOvelseScreen} />
      <Stack.Screen name="AktivOkt" component={AktivOktScreen} />
      <Stack.Screen name="ProgramBuilder" component={ProgramBuilderScreen} />
      <Stack.Screen name="ProgramDetalj" component={ProgramDetaljScreen} />
      <Stack.Screen name="Reassessment" component={ReassessmentScreen} />
      <Stack.Screen name="KartleggingDetalj" component={KartleggingDetaljScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const [bruker, setBruker] = useState<any>(undefined);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setBruker(u));
    return unsub;
  }, []);
  if (bruker === undefined) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  }
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!bruker ? (
          <>
            <Stack.Screen name="Innlogging" component={InnloggingScreen} />
            <Stack.Screen name="Registrering" component={RegistreringScreen} />
            <Stack.Screen name="Velkomst" component={VelkomstScreen} />
          </>
        ) : (
          <Stack.Screen name="Main" component={MainStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  tabBar: { backgroundColor: colors.bg, borderTopColor: colors.border, borderTopWidth: 1, height: 64 },
  icon: { alignItems: 'center' },
  label: { fontSize: 9, fontWeight: '500', letterSpacing: 0.7, color: colors.muted2 },
  labelActive: { color: colors.accent },
});
