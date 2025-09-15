import React, { useState, useEffect } from 'react';
import MDEditor from '@uiw/react-md-editor';
import {
  Box,
  Flex,
  Heading,
  VStack,
  Text,
  Button,
  Input,
  useColorModeValue,
  Spinner,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  useDisclosure,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Icon,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
} from '@chakra-ui/react';
import { ChevronRightIcon, ChevronDownIcon, HamburgerIcon } from '@chakra-ui/icons';
import { FolderIcon, FileIcon } from './icons';

// Recursive component to render file/folder tree
const FileTree = ({ items, onSelect, onRename, onDelete, onNewNoteInFolder, onNewFolder, onExportItem, selectedDoc, onSelectFolder, onMoveItem }) => {
  const [openFolders, setOpenFolders] = useState({});

  const toggleFolder = (path) => {
    setOpenFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  return (
    <VStack spacing={2} align="stretch">
      {items.map((item) => (
        <Box key={item.path} pl={item.type === 'file' ? 6 : 0}>
          <Flex align="center" justifyContent="space-between">
            <Button
              variant="ghost"
              justifyContent="flex-start"
              onClick={() => {
                if (item.type === 'file') {
                  onSelect(item.path);
                } else {
                  toggleFolder(item.path);
                  onSelectFolder(item.path);
                }
              }}
              colorScheme={selectedDoc === item.path ? 'blue' : 'gray'}
              flex="1"
            >
              <HStack spacing={2}>
                {item.type === 'folder' && (
                  <Icon
                    as={openFolders[item.path] ? ChevronDownIcon : ChevronRightIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolder(item.path);
                    }}
                  />
                )}
                <Icon as={item.type === 'file' ? FileIcon : FolderIcon} mr={2} />
                <Text isTruncated>{item.name}</Text>
              </HStack>
            </Button>
            <Menu>
              <MenuButton as={Button} size="xs" variant="ghost">
                ...
              </MenuButton>
              <MenuList>
                {item.type === 'folder' && (
                  <>
                    <MenuItem onClick={() => onNewNoteInFolder(item.path)}>New Note</MenuItem>
                    <MenuItem onClick={() => onNewFolder(item.path)}>New Folder</MenuItem>
                  </>
                )}
                <MenuItem onClick={() => onRename(item)}>Rename</MenuItem>
                <MenuItem onClick={() => onDelete(item)}>Delete</MenuItem>
                <MenuItem onClick={() => onMoveItem(item)}>Move</MenuItem>
                <MenuItem onClick={() => onExportItem(item)}>Export</MenuItem>
              </MenuList>
            </Menu>
          </Flex>
          {openFolders[item.path] && item.children && item.children.length > 0 && (
            <Box pl={4}>
              <FileTree
                items={item.children}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onNewNoteInFolder={onNewNoteInFolder}
                onNewFolder={onNewFolder}
                onExportItem={onExportItem}
                selectedDoc={selectedDoc}
                onSelectFolder={onSelectFolder}
                onMoveItem={onMoveItem}
              />
            </Box>
          )}
        </Box>
      ))}
    </VStack>
  );
};

const FolderList = ({ items, onSelect, selectedPath }) => {
  return (
    <VStack spacing={2} align="stretch">
      <Button
        variant="ghost"
        justifyContent="flex-start"
        onClick={() => onSelect('')}
        colorScheme={selectedPath === '' ? 'blue' : 'gray'}
      >
        <HStack spacing={2}>
          <Icon as={FolderIcon} mr={2} />
          <Text>Root</Text>
        </HStack>
      </Button>
      {items.map((item) => (
        <Box key={item.path} pl={4}>
          <Button
            variant="ghost"
            justifyContent="flex-start"
            onClick={() => onSelect(item.path)}
            colorScheme={selectedPath === item.path ? 'blue' : 'gray'}
          >
            <HStack spacing={2}>
              <Icon as={FolderIcon} mr={2} />
              <Text>{item.name}</Text>
            </HStack>
          </Button>
          {item.children && (
            <Box pl={4}>
              <FolderList items={item.children.filter(child => child.type === 'folder')} onSelect={onSelect} selectedPath={selectedPath} />
            </Box>
          )}
        </Box>
      ))}
    </VStack>
  );
};

function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [markdown, setMarkdown] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  const { isOpen: isRenameOpen, onOpen: onRenameOpen, onClose: onRenameClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isNewFolderOpen, onOpen: onNewFolderOpen, onClose: onNewFolderClose } = useDisclosure();
  const { isOpen: isNewNoteOpen, onOpen: onNewNoteOpen, onClose: onNewNoteClose } = useDisclosure();
  const { isOpen: isMoveOpen, onOpen: onMoveOpen, onClose: onMoveClose } = useDisclosure();

  const [itemToRename, setItemToRename] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [folderToCreateIn, setFolderToCreateIn] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newNoteName, setNewNoteName] = useState('');
  const [currentFolder, setCurrentFolder] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [destinationFolder, setDestinationFolder] = useState('');
  
  const API_URL = '/api';
  const cancelRef = React.useRef();
  const fileInputRef = React.useRef();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDocuments(data);
    } catch (e) {
      toast({
        title: "Error fetching documents",
        description: e.message,
        status: "error",
        duration: 9000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDocumentContent = async (id) => {
    if (!id) return;
    try {
      const response = await fetch(`${API_URL}/documents/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const content = await response.text();
      setSelectedDoc(id);
      setMarkdown(content);
    } catch (e) {
      toast({
        title: "Error fetching content",
        description: e.message,
        status: "error",
        duration: 9000,
        isClosable: true,
      });
    }
  };

  const saveDocument = async () => {
    if (!selectedDoc) return;
    try {
      const response = await fetch(`${API_URL}/documents/${selectedDoc}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/markdown',
        },
        body: markdown,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      toast({
        title: "Document saved.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      fetchDocuments();
    } catch (e) {
      toast({
        title: "Error saving document",
        description: e.message,
        status: "error",
        duration: 9000,
        isClosable: true,
      });
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteName) {
      toast({ title: "Note name cannot be empty.", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    const finalPath = currentFolder ? `${currentFolder}/${newNoteName}` : newNoteName;
    try {
        const response = await fetch(`${API_URL}/documents/${finalPath}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/markdown' },
            body: '# New Document\n\nWrite your content here.',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        setNewNoteName('');
        onNewNoteClose();
        fetchDocuments();
        fetchDocumentContent(finalPath);
        toast({
            title: "Note created.",
            status: "success",
            duration: 3000,
            isClosable: true,
        });
    } catch (e) {
        toast({
            title: "Error creating note",
            description: e.message,
            status: "error",
            duration: 9000,
            isClosable: true,
        });
    }
  };
  
  const handleRename = async () => {
    if (!itemToRename || !newNoteName) return;
    const newPath = newNoteName;

    try {
      const response = await fetch(`${API_URL}/documents/${itemToRename.path}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath: newPath }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      onRenameClose();
      fetchDocuments();
      toast({ title: `${itemToRename.name} renamed.`, status: "success", duration: 3000, isClosable: true });
    } catch (e) {
      toast({ title: "Error renaming item", description: e.message, status: "error", duration: 9000, isClosable: true });
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      const response = await fetch(`${API_URL}/documents/${itemToDelete.path}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      onDeleteClose();
      fetchDocuments();
      if (selectedDoc === itemToDelete.path) {
        setSelectedDoc(null);
      }
      if (itemToDelete.type === 'folder' && itemToDelete.path === currentFolder) {
        setCurrentFolder('');
      }
      toast({ title: `${itemToDelete.name} deleted.`, status: "success", duration: 3000, isClosable: true });
    } catch (e) {
      toast({ title: "Error deleting item", description: e.message, status: "error", duration: 9000, isClosable: true });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName) {
      toast({ title: "Folder name cannot be empty.", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    const fullPath = folderToCreateIn ? `${folderToCreateIn}/${newFolderName}` : newFolderName;
    try {
      const response = await fetch(`${API_URL}/folders/${fullPath}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      onNewFolderClose();
      fetchDocuments();
      toast({ title: "Folder created.", status: "success", duration: 3000, isClosable: true });
    } catch (e) {
      toast({ title: "Error creating folder", description: e.message, status: "error", duration: 9000, isClosable: true });
    }
  };
  
  const handleMove = async () => {
    if (!itemToMove) return;

    // Check if the item is being moved to its current location
    const destinationPath = destinationFolder === '' ? '' : destinationFolder;
    const currentDirectory = itemToMove.path.substring(0, itemToMove.path.lastIndexOf('/'));

    if (destinationPath === currentDirectory) {
        toast({
            title: "Cannot move item to its current location.",
            status: "error",
            duration: 3000,
            isClosable: true,
        });
        onMoveClose();
        return;
    }

    const newPath = destinationFolder ? `${destinationFolder}/${itemToMove.name}` : itemToMove.name;

    try {
        const response = await fetch(`${API_URL}/documents/${itemToMove.path}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPath: newPath }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        onMoveClose();
        fetchDocuments();
        toast({
            title: `${itemToMove.name} moved.`,
            status: "success",
            duration: 3000,
            isClosable: true,
        });
    } catch (e) {
        toast({
            title: "Error moving item",
            description: e.message,
            status: "error",
            duration: 9000,
            isClosable: true,
        });
    }
  };
  
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_URL}/import`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        toast({
            title: "Import successful.",
            status: "success",
            duration: 3000,
            isClosable: true,
        });
        fetchDocuments();
    } catch (e) {
        toast({
            title: "Import failed.",
            description: e.message,
            status: "error",
            duration: 9000,
            isClosable: true,
        });
    }
  };

  const sidebarBg = useColorModeValue("gray.100", "gray.700");
  const mainBg = useColorModeValue("white", "gray.800");

  const startResizing = (e) => {
    e.preventDefault();
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResizing);
  };

  const resize = (e) => {
    const newWidth = e.clientX;
    if (newWidth > 200 && newWidth < 800) {
      setSidebarWidth(newWidth);
    }
  };

  const stopResizing = () => {
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResizing);
  };

  return (
    <Flex h="100vh">
      {/* Sidebar */}
      <Box
        w={isSidebarCollapsed ? '0px' : `${sidebarWidth}px`}
        minW={isSidebarCollapsed ? '0px' : '200px'}
        bg={sidebarBg}
        p={isSidebarCollapsed ? 0 : 4}
        borderRight="1px"
        borderColor="gray.200"
        transition="width 0.2s"
        position="relative"
        overflow="hidden"
      >
        <Flex
          justifyContent="space-between"
          alignItems="center"
          mb={6}
          pr={isSidebarCollapsed ? 0 : 4}
          transition="padding-right 0.2s"
        >
          {!isSidebarCollapsed && (
            <Heading as="h1" size="lg" color="gray.600">
              A Simple Data Flow
            </Heading>
          )}
          <IconButton
            icon={<HamburgerIcon />}
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            variant="ghost"
            aria-label="Toggle Sidebar"
          />
        </Flex>

        {!isSidebarCollapsed && (
          <>
            <VStack spacing={4} align="stretch" mb={4}>
              <Button colorScheme="blue" onClick={() => {
                setCurrentFolder('');
                onNewNoteOpen();
              }}>
                New Note
              </Button>
              <Button colorScheme="gray" onClick={() => onNewFolderOpen()}>
                New Folder
              </Button>
              <Input type="file" ref={fileInputRef} onChange={handleImport} display="none" />
              <Button colorScheme="teal" onClick={() => fileInputRef.current.click()}>
                Import
              </Button>
            </VStack>

            <Box mt={6} overflowY="auto" flexGrow={1}>
              {isLoading ? (
                <Flex justify="center" align="center" h="100%">
                  <Spinner />
                </Flex>
              ) : documents.length === 0 ? (
                <Flex direction="column" justify="center" align="center" h="100%">
                  <Text fontSize="sm" color="gray.500" textAlign="center">
                    No documents or folders found. Create a new one above.
                  </Text>
                </Flex>
              ) : (
                <FileTree
                  items={documents}
                  onSelect={fetchDocumentContent}
                  onRename={(item) => {
                    setItemToRename(item);
                    setNewNoteName(item.name);
                    onRenameOpen();
                  }}
                  onDelete={(item) => {
                    setItemToDelete(item);
                    onDeleteOpen();
                  }}
                  onNewNoteInFolder={(path) => {
                    setCurrentFolder(path);
                    setNewNoteName('');
                    onNewNoteOpen();
                  }}
                  onNewFolder={(path) => {
                    setFolderToCreateIn(path);
                    setNewFolderName('');
                    onNewFolderOpen();
                  }}
                  onExportItem={(item) => {
                      const url = `${API_URL}/export/${item.path}`;
                      window.open(url, '_blank');
                  }}
                  selectedDoc={selectedDoc}
                  onSelectFolder={setCurrentFolder}
                  onMoveItem={(item) => {
                    setItemToMove(item);
                    setDestinationFolder('');
                    onMoveOpen();
                  }}
                />
              )}
            </Box>
          </>
        )}

        {/* Resizer Handle */}
        <Box
          position="absolute"
          top="0"
          right="0"
          bottom="0"
          width="5px"
          cursor="col-resize"
          onMouseDown={startResizing}
          _hover={{ bg: 'gray.300' }}
        />
      </Box>

      {/* Main Content Area */}
      <Flex flexGrow={1} bg={mainBg} p={8} direction="column">
        {selectedDoc ? (
          <>
            <Heading as="h2" size="xl" mb={4} color="gray.600">
              {selectedDoc}
            </Heading>
            <Box flexGrow={1} mb={4} p={4} borderWidth="1px" borderRadius="lg" bg="white">
              <MDEditor
                value={markdown}
                onChange={setMarkdown}
                height="calc(100vh - 200px)"
                preview="edit"
                data-color-mode="light"
              />
            </Box>
            <Button colorScheme="green" onClick={saveDocument} alignSelf="flex-end">
              Save Document
            </Button>
          </>
        ) : (
          <Flex flexGrow={1} justify="center" align="center" direction="column">
            <Heading as="h3" size="md" mb={2}>
              Welcome!
            </Heading>
            <Text color="gray.500">
              Select a document from the sidebar to start editing, or create a new one.
            </Text>
          </Flex>
        )}
      </Flex>

      {/* Modals for rename, delete, and new folder */}
      {/* New Note Modal */}
      <Modal isOpen={isNewNoteOpen} onClose={onNewNoteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create New Note</ModalHeader>
          <ModalBody>
            <FormControl>
              <FormLabel>Note name</FormLabel>
              <Input
                placeholder="note-name"
                value={newNoteName}
                onChange={(e) => setNewNoteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNote();
                }}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onNewNoteClose} mr={3}>Cancel</Button>
            <Button colorScheme="blue" onClick={handleCreateNote}>Create</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Rename Modal */}
      <Modal isOpen={isRenameOpen} onClose={onRenameClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Rename {itemToRename?.type}</ModalHeader>
          <ModalBody>
            <FormControl>
              <FormLabel>New name</FormLabel>
              <Input
                value={newNoteName}
                onChange={(e) => setNewNoteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                }}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onRenameClose} mr={3}>Cancel</Button>
            <Button colorScheme="blue" onClick={handleRename}>Rename</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Alert Dialog */}
      <AlertDialog
        isOpen={isDeleteOpen}
        leastDestructiveRef={cancelRef}
        onClose={onDeleteClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete {itemToDelete?.type}
            </AlertDialogHeader>
            <AlertDialogBody>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onDeleteClose}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleDelete} ml={3}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* Create Folder Modal */}
      <Modal isOpen={isNewFolderOpen} onClose={onNewFolderClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create New Folder</ModalHeader>
          <ModalBody>
            <FormControl>
              <FormLabel>Folder name</FormLabel>
              <Input
                placeholder="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onNewFolderClose} mr={3}>Cancel</Button>
            <Button colorScheme="blue" onClick={handleCreateFolder}>Create</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Move Modal */}
      <Modal isOpen={isMoveOpen} onClose={onMoveClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Move "{itemToMove?.name}"</ModalHeader>
          <ModalBody>
            <FormControl>
              <FormLabel>Select a destination folder</FormLabel>
              <Box borderWidth="1px" p={2} borderRadius="md" maxH="200px" overflowY="auto">
                <FolderList
                  items={documents.filter(item => item.type === 'folder')}
                  onSelect={setDestinationFolder}
                  selectedPath={destinationFolder}
                />
              </Box>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onMoveClose} mr={3}>Cancel</Button>
            <Button colorScheme="blue" onClick={handleMove}>Move</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </Flex>
  );
}

export default App;