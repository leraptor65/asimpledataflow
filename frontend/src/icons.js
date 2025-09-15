import { createIcon } from '@chakra-ui/react';
import React from 'react';

export const FolderIcon = createIcon({
  displayName: 'FolderIcon',
  viewBox: '0 0 24 24',
  path: (
    <path
      fill="currentColor"
      d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"
    />
  ),
});

export const FileIcon = createIcon({
  displayName: 'FileIcon',
  viewBox: '0 0 24 24',
  path: (
    <path
      fill="currentColor"
      d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z"
    />
  ),
});