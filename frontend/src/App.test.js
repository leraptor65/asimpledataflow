import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the app title', () => {
  render(<App />);
  const linkElement = screen.getByText(/A Simple Data Flow/i);
  expect(linkElement).toBeInTheDocument();
});