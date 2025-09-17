import { useState, useEffect } from 'react';

const useTheme = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        const savedTheme = localStorage.getItem('darkMode');
        if (savedTheme) {
            setIsDarkMode(JSON.parse(savedTheme));
        }
    }, []);

    const toggleTheme = (checked) => {
        setIsDarkMode(checked);
        localStorage.setItem('darkMode', JSON.stringify(checked));
    };

    return { isDarkMode, toggleTheme };
};

export default useTheme;