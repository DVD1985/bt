# Batallón Táctico

**Batallón Táctico** es un juego de estrategia multijugador en tiempo real (RTS/Turn-based) donde dos comandantes se enfrentan en un campo de batalla con niebla de guerra. El objetivo es eliminar al Comandante enemigo usando una variedad de unidades con habilidades únicas.

## 🚀 Características Principales

*   **Multijugador en Tiempo Real**: Juega contra otros usuarios conectados al lobby.
*   **Sistema de Salas**: Crea partidas privadas o únete a salas existentes.
*   **Niebla de Guerra**: La posición del enemigo es desconocida hasta que atacas o usas unidades de reconocimiento.
*   **Clases de Unidades**:
    *   👑 **Comandante**: La unidad vital. Si muere, pierdes.
    *   🚛 **Tanque**: Daño en área horizontal (fila completa).
    *   ✈️ **Caza**: Ataque en diagonal.
    *   🎯 **Francotirador**: Daño letal a un solo objetivo.
    *   📡 **Escáner**: Revela zonas ocultas y daña en área.
    *   👤 **Infantería**: Unidad básica con capacidad de curación.

## 🛠️ Tecnologías

Este proyecto está construido con:
*   [React](https://react.dev/) - Biblioteca de UI.
*   [Vite](https://vitejs.dev/) - Entorno de desarrollo rápido.
*   [Tailwind CSS](https://tailwindcss.com/) - Estilos y diseño.
*   [Firebase](https://firebase.google.com/) - Backend (Firestore para base de datos en tiempo real, Auth para autenticación anónima).

## ⚙️ Configuración e Instalación

1.  **Clonar el repositorio**
    ```bash
    git clone <url-del-repo>
    cd bt
    ```

2.  **Instalar dependencias**
    ```bash
    npm install
    ```

3.  **Configurar Variables de Entorno**
    Crea un archivo `.env.local` en la raíz del proyecto y añade tus credenciales de Firebase:
    ```properties
    VITE_FIREBASE_API_KEY=tu_api_key
    VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
    VITE_FIREBASE_PROJECT_ID=tu_project_id
    VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
    VITE_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
    VITE_FIREBASE_APP_ID=tu_app_id
    VITE_FIREBASE_MEASUREMENT_ID=tu_measurement_id
    ```

4.  **Ejecutar en desarrollo**
    ```bash
    npm run dev
    ```
    Para probar en móvil en la misma red WiFi:
    ```bash
    npm run dev -- --host
    ```

## 🎮 Cómo Jugar

1.  Abre la aplicación.
2.  En el **Lobby**, crea una "Nueva Operación" o únete a una existente.
3.  **Fase de Despliegue**: Coloca tus unidades en tu zona (o usa "Aleatorio") y confirma.
4.  **Fase de Batalla**:
    *   Espera tu turno.
    *   Selecciona una unidad aliada.
    *   Haz clic en una casilla vacía para **Mover** o en una casilla enemiga (incluso si está oculta) para **Atacar**.
    *   Usa la intuición para localizar y destruir al Comandante rival.

---
*Desarrollado con React y Firebase.*
