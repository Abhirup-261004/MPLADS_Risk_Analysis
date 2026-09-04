import React, { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  handleReset = () => {
    localStorage.removeItem('prahari_user');
    localStorage.removeItem('prahari_token');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <main className="render-error"><section><p>Secure access portal</p><h1>We could not restore this session.</h1><button onClick={this.handleReset}>Return to sign in</button></section></main>;
    }
    return this.props.children;
  }
}
