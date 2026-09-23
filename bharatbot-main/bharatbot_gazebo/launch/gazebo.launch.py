#!/usr/bin/env python3

import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, TimerAction, SetEnvironmentVariable
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution, Command
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare
from launch_ros.parameter_descriptions import ParameterValue


def generate_launch_description():
    # Package Directories
    pkg_bharatbot_description = FindPackageShare('bharatbot_description')
    pkg_bharatbot_gazebo = FindPackageShare('bharatbot_gazebo')
    
    # Paths
    urdf_file = PathJoinSubstitution([
        pkg_bharatbot_description,
        'urdf',
        'bharatbot.urdf.xacro'
    ])
    
    # World file - use argument for flexibility
    world_file = PathJoinSubstitution([
        pkg_bharatbot_gazebo,
        'worlds',
        LaunchConfiguration('world')
    ])
    
    rviz_config_file = PathJoinSubstitution([
        pkg_bharatbot_description,
        'rviz',
        'rviz.rviz'
    ])
    
    # Set Gazebo resource path to find the meshes
    desc_path = get_package_share_directory('bharatbot_description')
    install_dir = os.path.dirname(desc_path)  # Get the install directory
    
    gazebo_resource_path = SetEnvironmentVariable(
        name='GZ_SIM_RESOURCE_PATH',
        value=os.pathsep.join([
            install_dir,  # This allows model://bharatbot_description to work
            os.environ.get('GZ_SIM_RESOURCE_PATH', '')
        ])
    )

    # Launch Arguments
    world_arg = DeclareLaunchArgument(
        'world',
        default_value='home.sdf',
        description='World file name (e.g. home.sdf)'
    )
    
    use_rviz_arg = DeclareLaunchArgument(
        'use_rviz',
        default_value='true',
        description='Launch RViz if true'
    )
    
    x_arg = DeclareLaunchArgument(
        'x',
        default_value='2.5',
        description='X position to spawn the robot'
    )
    
    y_arg = DeclareLaunchArgument(
        'y',
        default_value='1.5',
        description='Y position to spawn the robot'
    )
    
    z_arg = DeclareLaunchArgument(
        'z',
        default_value='0.15',
        description='Z position to spawn the robot'
    )
    
    yaw_arg = DeclareLaunchArgument(
        'yaw',
        default_value='-1.5707',
        description='Yaw angle to spawn the robot'
    )

    # Robot State Publisher (using sim time)
    robot_state_publisher_node = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        name='robot_state_publisher',
        output='screen',
        parameters=[{
            'robot_description': ParameterValue(Command(['xacro ', urdf_file]), value_type=str),
            'use_sim_time': True
        }]
    )

    # Gazebo launch using ros_gz_sim (ROS 2 Jazzy)
    gazebo_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            PathJoinSubstitution([
                FindPackageShare('ros_gz_sim'),
                'launch',
                'gz_sim.launch.py'
            ])
        ]),
        launch_arguments={
            'gz_args': ['-r -v4 ', world_file],
            'on_exit_shutdown': 'true'
        }.items()
    )

    # Spawn Robot in Gazebo (delayed to ensure Gazebo is ready)
    spawn_robot = TimerAction(
        period=3.0,
        actions=[
            Node(
                package='ros_gz_sim',
                executable='create',
                name='spawn_bharatbot',
                arguments=[
                    '-topic', 'robot_description',
                    '-name', 'bharatbot',
                    '-x', LaunchConfiguration('x'),
                    '-y', LaunchConfiguration('y'),
                    '-z', LaunchConfiguration('z'),
                    '-Y', LaunchConfiguration('yaw')
                ],
                output='screen'
            )
        ]
    )

    # Bridge node for /cmd_vel, /odom, /joint_states, /tf, /camera, and /clock
    use_sim_time_arg = DeclareLaunchArgument(
        'use_sim_time',
        default_value='true',
        description='Use simulation time'
    )
    
    # Main bridge node
    gz_bridge_node = Node(
        package="ros_gz_bridge",
        executable="parameter_bridge",
        arguments=[
            "/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock",
            "/cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist",
            "/odom@nav_msgs/msg/Odometry[gz.msgs.Odometry",
            "/scan@sensor_msgs/msg/LaserScan[gz.msgs.LaserScan",
            "/model/bharatbot/tf@tf2_msgs/msg/TFMessage[gz.msgs.Pose_V",
            "/camera/camera_info@sensor_msgs/msg/CameraInfo[gz.msgs.CameraInfo",
            "/imu/data@sensor_msgs/msg/Imu[gz.msgs.IMU",
            "/world/default/model/bharatbot/joint_state@sensor_msgs/msg/JointState[gz.msgs.Model",
        ],
        output="screen",
        parameters=[
            {'use_sim_time': LaunchConfiguration('use_sim_time')},
        ],
        remappings=[
            ('/world/default/model/bharatbot/joint_state', '/joint_states'),
            ('/model/bharatbot/tf', '/tf'),
        ]
    )

    # Image bridge node for camera
    gz_image_bridge_node = Node(
        package="ros_gz_image",
        executable="image_bridge",
        arguments=[
            "/camera/image",
        ],
        output="screen",
        parameters=[
            {'use_sim_time': LaunchConfiguration('use_sim_time'),
             'camera.image.compressed.jpeg_quality': 75},
        ],
    )

    # Relay node to republish camera_info
    relay_camera_info_node = Node(
        package='topic_tools',
        executable='relay',
        name='relay_camera_info',
        output='screen',
        arguments=['camera/camera_info', 'camera/image/camera_info'],
        parameters=[
            {'use_sim_time': LaunchConfiguration('use_sim_time')},
        ]
    )

    # RViz (optional)
    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        name='rviz2',
        output='screen',
        arguments=['-d', rviz_config_file],
        condition=IfCondition(LaunchConfiguration('use_rviz')),
        parameters=[{
            'use_sim_time': True
        }]
    )

    return LaunchDescription([
        gazebo_resource_path,
        world_arg,
        use_rviz_arg,
        use_sim_time_arg,
        x_arg,
        y_arg,
        z_arg,
        yaw_arg,
        robot_state_publisher_node,
        gazebo_launch,
        spawn_robot,
        gz_bridge_node,
        gz_image_bridge_node,
        relay_camera_info_node,
        rviz_node
    ])
