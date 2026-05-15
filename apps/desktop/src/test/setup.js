import '@testing-library/jest-dom';
// jsdom doesn't implement scrollIntoView; AgentPanel relies on it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => { };
}
