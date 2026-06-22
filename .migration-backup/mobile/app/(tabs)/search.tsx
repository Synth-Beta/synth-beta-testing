import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import SearchScreen from '../../src/components/SearchContents';

export default function SearchTab() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <SearchScreen initialQuery={q ?? ''} />;
}
