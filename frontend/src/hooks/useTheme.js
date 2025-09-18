import { useState, useEffect } from 'react';

const useTheme = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        try {
            const savedTheme = localStorage.getItem('darkMode');
            return savedTheme ? JSON.parse(savedTheme) : false;
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
        } catch (e) {
            console.error("Could not save theme to localStorage", e);
        }
    }, [isDarkMode]);

    const toggleTheme = (checked) => {
        setIsDarkMode(checked);
    };

    return { isDarkMode, toggleTheme };
};

export default useTheme;
