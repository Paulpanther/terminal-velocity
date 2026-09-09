# Terminal Velocity

[![CI](https://github.com/Paulpanther/terminal-velocity/actions/workflows/ci.yml/badge.svg)](https://github.com/Paulpanther/terminal-velocity/actions/workflows/ci.yml)

> An atmospheric, text-based space exploration game played in a web browser terminal.

*This description was written by AI but the idea and concept is entirely my own.*

## ──  OVERVIEW 

**Terminal Velocity** is an atmospheric, browser-based exploration game where you remotely control a space probe launched through a wormhole into an unknown, distant galaxy. 

Trapped in a low-level interface, you interact with the probe almost entirely through a terminal console by issuing manual commands, reading raw telemetry data, and navigating a physical star system with extremely limited visibility.

The core design centers around **claustrophobia, isolation, and gradual progression**: you operate in the dark, relying purely on raw sensor values, scheduled thruster burns, and star-tracker orientation to make sense of the void around you.

## ──  CORE CONCEPT & GAMEPLAY 

### 1. Claustrophobic & Low-Level Interface
* **Minimalist Telemetry:** You do not get a real-time 3D view or an easy minimap at the start. You only receive raw sensor inputs, log outputs, and data packets.
* **Realistic Navigation Principles:** Determine your rotation and position using celestial navigation concepts (e.g., star maps, IMUs/inertial measurement units) rather than precise GPS-like markers.
* **Manual Control:** Execute low-level operations such as burning thrusters for precise durations or inspecting local filesystem logs stored on the probe.

### 2. Scavenging & Upgrades
* **Derelict Probes:** The journey through the wormhole damaged your probe and destroyed previous missions. By locating and retrieving parts from these failed probes, you repair and expand your systems.
* **Unlocking Features:** Over time, upgrades grant new capabilities—transitioning from pure command-line interaction to displaying graphical UI elements (e.g., system maps, image rendering from an onboard camera, or enhanced sensor tools).

### 3. Deep Space Exploration & Lore
* **An Ancient Galaxy:** Fly through unfamiliar star systems, survey alien worlds, and discover the remnants of a lost civilization.
* **System Interfacing:** Hack or interface with remote computer systems, ancient relays, and alien shells throughout the galaxy.

### 4. Scale & Networked Probes *(Conceptual)*
* **Drones & Cloning:** Potential mid-to-late game mechanics involve deploying or cloning secondary probes, managing a distributed network of automated units, or tapping into planet-wide computing networks.


## ── THE TERMINAL EXPERIENCE (CURRENT FOCUS)

Since the terminal serves as the core primitive of the entire game, building a responsive, feature-rich, and visually striking terminal component is the top priority for early development:

* **UX & Polish:** Letter-by-letter text stream animations, customizable themes (retro/cyberpunk aesthetics), and atmospheric shader effects (CRT scanlines, subtle screen warp).
* **CLI Features:** Syntax highlighting, tab autocompletion, robust command history, and a simulated filesystem.
* **Soundscape & Audio:** Ambient sci-fi background noise, mechanical feedback, and audio cues representing spacecraft operations.

## ── DEVELOPMENT STATUS 

* [x] **Repository Initialized**
* [ ] **Phase 1:** Core Terminal Component (UI/UX, Text Rendering, Command Parser, Autocomplete)
* [ ] **Phase 2:** Orbital Mechanics & Physical Simulation (2D Physics, Thrusters, Telemetry)
* [ ] **Phase 3:** Sensor & Navigation Systems (Star Map, IMU, Data Processing)
* [ ] **Phase 4:** Probe Salvage, Upgrades & Visual Subsystems
* [ ] **Phase 5:** World Building, Interactive Shells & Narrative Content

## ── LICENSE 

*To be determined.*
