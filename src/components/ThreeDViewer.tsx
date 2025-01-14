import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Client } from 'paho-mqtt';

function updateSphereInstances(instancedMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshPhongMaterial, THREE.InstancedMeshEventMap>,
    newPointsData: number[][], sphereRadius: number, scene) {
    // If the number of points changes, dispose of the old mesh and create a new one.
    if (instancedMesh.count !== newPointsData.length) {
        console.log("Removing old instances");
        // Dispose of the old instanced mesh.
        instancedMesh.geometry.dispose();
        instancedMesh.material.dispose();
        scene.remove(instancedMesh);

        // Create a new instanced mesh.
        instancedMesh = createSphereInstances(newPointsData, sphereRadius, scene);
    } else {
        // If the number of points is the same, just update the positions.
        const tempObject = new THREE.Object3D();

        newPointsData.forEach((point, index) => {
            tempObject.position.set(point[0], point[1], point[2]);
            tempObject.updateMatrix();
            instancedMesh.setMatrixAt(index, tempObject.matrix);
        });

        instancedMesh.instanceMatrix.needsUpdate = true;
    }

    return instancedMesh;
}

function createSphereInstances(newPointsData, sphereRadius, scene) {
    // Create the base geometry for a sphere.
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);

    // Create a material for the spheres.
    const material = new THREE.MeshPhongMaterial({ color: 0xffff00 });

    // Create an InstancedMesh with the sphere geometry and material.
    // The second parameter is the number of instances.
    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, newPointsData.length);

    // Temporary object for setting the position of each instance.
    const tempObject = new THREE.Object3D();

    newPointsData.forEach((point, index) => {
        // Set the position for the tempObject.
        tempObject.position.set(point[0], point[1], point[2]);

        // Update the matrix for the instance.
        tempObject.updateMatrix();

        // Set the matrix for the instance at the index.
        instancedMesh.setMatrixAt(index, tempObject.matrix);
    });

    // Add the instanced mesh to the scene.
    scene.add(instancedMesh);

    // If you need to update the spheres later, you can update the matrices again
    // and then call instancedMesh.instanceMatrix.needsUpdate = true;

    return instancedMesh;
}


const ThreeDViewer = () => {
    const mountRef = useRef(null);



    useEffect(() => {
        // Set up the scene, camera, and renderer
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });

        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);


        // Set up the camera position and orbit controls
        camera.position.set(5, 5, 5);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.update();

        // Add grid helper and axis helper
        const gridHelper = new THREE.GridHelper(10, 10);
        const axesHelper = new THREE.AxesHelper(5);
        scene.add(gridHelper);
        scene.add(axesHelper);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
        scene.add(ambientLight);

        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        camera.add(directionalLight);
        scene.add(camera)

        // Animation loop
        const animate = () => {

            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);

        };
        animate();

        // Handle window resizing
        const onWindowResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onWindowResize, false);

        let sphereInstances = createSphereInstances([], 0.1, scene);

        // MQTT connection setup
        const client = new Client('localhost', 8080, '3dclientId' + new Date().getTime());
        client.connect({
            onSuccess: () => {
                console.log("Connected to MQTT broker");
                client.subscribe('points');
            },
        });

        client.onMessageArrived = (message) => {
            if (message.destinationName === 'points') {

                const bytes = message.payloadBytes;

                const pointsData = convertToFloat64Triples(bytes as Paho.MQTT.TypedArray);
                // console.log(pointsData);
                //const pointsData = JSON.parse(message.payloadString);
                sphereInstances = updateSphereInstances(sphereInstances, pointsData, 0.1, scene);

                //updatePoints(scene, pointsData);
            }
        };

        function convertToFloat64Triples(typedArray: Paho.MQTT.TypedArray): number[][] {
            // Create an empty array to store the triples
            const dataView = new DataView(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
            const triples = [];

            for (let i = 0; i < typedArray.byteLength; i += 8 * 3) {
                // Read a 64-bit float (double) from the current position
                // little-endian
                const x = dataView.getFloat64(i + 0, true);
                const y = dataView.getFloat64(i + 8, true);
                const z = dataView.getFloat64(i + 16, true);
                // console.log(x, y, z);
                triples.push([x, y, z]);
            }

            return triples;
        }



        // Assign the current value of the ref to a variable
        const currentMount = mountRef.current;

        // Animation loop and other logic...

        // Cleanup function
        return () => {
            window.removeEventListener('resize', onWindowResize);
            // Use the variable for the cleanup instead of the ref
            if (currentMount) {
                currentMount.removeChild(renderer.domElement);
            }
            client.disconnect(); // Disconnect from MQTT broker on cleanup
        };
    }, [mountRef]);

    return (<div className="threedviewer" ref={mountRef} style={{ width: '100vw', height: '100vh' }} />);
};

export default ThreeDViewer;