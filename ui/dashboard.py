"""
Streamlit frontend dashboard configuration
"""
import streamlit as st

def render_dashboard():
    st.title("Civic Behaviour Monitoring System")
    st.sidebar.header("System Controls")
    st.sidebar.button("Start Pipeline")
    
    st.subheader("Live Feed")
    frame_placeholder = st.empty()
    
    st.subheader("Recent Activity Log")
    log_placeholder = st.empty()
    
    return frame_placeholder, log_placeholder
