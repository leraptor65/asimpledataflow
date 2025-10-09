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
            }}
        >
            <Layout style={{ minHeight: '100vh', flexDirection: 'row' }}>
                {!isMobile && (
                    <Sidebar
                        notes={notes}
                        isSidebarCollapsed={isSidebarCollapsed}
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

