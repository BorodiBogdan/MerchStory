import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Image, type ImageProps, StyleSheet, View } from 'react-native';

import { useTheme } from '@/context/theme';
import { useProductImage } from '@/utils/productImageCache';

interface ProductImageProps extends Omit<ImageProps, 'source'> {
  id: string;
  showSpinner?: boolean;
}

export function ProductImage({ id, showSpinner = true, style, ...rest }: ProductImageProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { uri, loading, error } = useProductImage(id);

  if (!uri) {
    return (
      <View style={[styles.placeholder, style]}>
        {error ? (
          <Ionicons name="alert-circle-outline" size={24} color={colors.text.muted} />
        ) : loading && showSpinner ? (
          <ActivityIndicator size="small" color={colors.accent.primary} />
        ) : (
          <Ionicons name="image-outline" size={24} color={colors.text.muted} />
        )}
      </View>
    );
  }

  return <Image source={{ uri }} style={style} {...rest} />;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    placeholder: {
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
