import React, { useState, useEffect } from 'react';
import { Layout, ConfigProvider, theme, Grid } from 'antd';
import Sidebar from './components/Sidebar';
import NoteEditor from './components/NoteEditor';
import { Modals } from './components/Modals';
import { ReferenceModal } from './components/ReferenceModal';
import useNotes from './hooks/useNotes';
import useTheme from './hooks/useTheme';

const { Content } = Layout;
const { useBreakpoint } = Grid;

function App() {
    const { isDarkMode, toggleTheme } = useTheme();
    const notes = useNotes();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const screens = useBreakpoint();

    const isMobile = !screens.md;

    // Automatically collapse the sidebar on mobile devices
    useEffect(() => {
        if (isMobile) {
            setIsSidebarCollapsed(true);
        }
    }, [isMobile]);

    // On mobile, the content should take up the full width.
    // On desktop, we adjust the margin based on the sidebar's state.
    const mainContentMarginLeft = isMobile ? 0 : isSidebarCollapsed ? 80 : 280;

    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
                token: {
                    colorPrimary: '#1a73e8', // Google Blue
                    colorLink: '#1a73e8',
                    borderRadius: 8,
                    colorBgContainer: isDarkMode ? '#1e1f20' : '#ffffff', // Surface colors
                    colorBgLayout: isDarkMode ? '#131314' : '#f0f4f9', // Background colors
                },
                components: {
                    Layout: {
                        siderBg: isDarkMode ? '#1e1f20' : '#f0f4f9',
                        bodyBg: isDarkMode ? '#131314' : '#ffffff',
                    },
                    Menu: {
                        itemBg: 'transparent',
                    }
                }
            }}
        >
            <Layout style={{ minHeight: '100vh', flexDirection: 'row' }} data-color-mode={isDarkMode ? 'dark' : 'light'}>
                {!isMobile && (
                    <Sidebar
                        notes={notes}
                        isSidebarCollapsed={isSidebarCollapsed} // Ensure prop name matches Sidebar definition
                        setIsSidebarCollapsed={setIsSidebarCollapsed}
                        toggleTheme={toggleTheme}
                        isDarkMode={isDarkMode}
                    />
                )}
                <Layout style={{ marginLeft: mainContentMarginLeft, transition: 'margin-left 0.2s' }}>
                    <Content style={{ padding: isMobile ? '0.5rem' : '1rem', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                        <NoteEditor
                            notes={notes}
                            isDarkMode={isDarkMode}
                            toggleTheme={toggleTheme}
                            isMobile={isMobile}
                        />
                    </Content>
                </Layout>
                <Modals notes={notes} />
                <ReferenceModal notes={notes} />
            </Layout>
        </ConfigProvider>
    );
}

export default App;

