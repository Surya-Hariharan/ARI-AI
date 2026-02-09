/**
 * App Entry Point
 * 
 * Redirects to the Control App (Master Node) dashboard.
 */

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(control)" />;
}
