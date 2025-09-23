import React, { useState } from 'react';
import { Layout, ConfigProvider, theme } from 'antd';
import Sidebar from './components/Sidebar';
import NoteEditor from './components/NoteEditor';
import { Modals } from './components/Modals';
import useNotes from './hooks/useNotes';
import useTheme from './hooks/useTheme';

const { Content } = Layout;

function App() {
    const { isDarkMode, toggleTheme } = useTheme();
    const notes = useNotes();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Dynamic width for the main content to adjust for the sidebar.
    const mainContentMarginLeft = isSidebarCollapsed ? 80 : 280;

    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
            }}
        >
            <Layout style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>
                <Sidebar
                    notes={notes}
                    isSidebarCollapsed={isSidebarCollapsed}
                    setIsSidebarCollapsed={setIsSidebarCollapsed}
                    toggleTheme={toggleTheme}
                    isDarkMode={isDarkMode}
                />
                <Layout style={{ marginLeft: mainContentMarginLeft, transition: 'margin-left 0.2s' }}>
                    <Content style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
                        <NoteEditor notes={notes} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
                    </Content>
                </Layout>
                <Modals notes={notes} />
            </Layout>
        </ConfigProvider>
    );
}

export default App;

