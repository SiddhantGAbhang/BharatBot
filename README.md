# BharatBot
Indigenous Modular Autonomous Servicing Robot for Future Lunar and Martian Habitats

Team: The Vanguard

🌙 Overview
BharatBot is a ROS2-based autonomous rover simulation designed to enhance astronaut safety and mission reliability by operating in GPS-denied indoor lunar and marsn habitats as well as surrounding terrain. It integrates navigation, hazard detection, and life-support monitoring, validated in a high-fidelity Gazebo simulation framework built for realistic lunar physics, terrain, and environmental conditions.

🚀 Key Features
Autonomous Navigation & Mapping
SLAM with LiDAR, RGB-D camera, IMU, and wheel encoder odometry
GPS-denied localization with <1% drift per km
Real-time mapping at ≥10 Hz
Hazard Detection & Safe Path Planning
Real-time obstacle detection (rocks, craters, steep slopes)
Path planning algorithms to prevent tip-over risks
Hazard response <200 ms in simulation
Habitat Monitoring
Environmental sensors: O₂, temperature, pressure monitoring
Anomaly detection within 20-30 seconds
Early warning system for life-support failures
Routine Patrols & Maintenance
Automated corridor inspections
Equipment health checks
Scheduled patrol routes
Emergency response protocols
