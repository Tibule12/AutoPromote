import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import EducationPage from '../../frontend/src/education/EducationPage';
createRoot(document.getElementById('root')).render(<HashRouter><EducationPage /></HashRouter>);
