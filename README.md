# International Digital Payment System
git 
The project focuses on secure user authentication, modular backend design, and foundational payment-system components.

---

## Overview

This project implements the backend of a digital payment system using modern web technologies.  
It demonstrates how real-world payment platforms handle authentication, security, and backend service organization.

---

## Key Features

- User registration and login
- Secure password hashing
- JWT-based authentication
- Modular backend architecture
- RESTful API design
- Database integration using SQLAlchemy

---

## Tech Stack

- **Backend Framework:** FastAPI (Python)
- **Database:** MySQL
- **ORM:** SQLAlchemy
- **Authentication:** JWT (JSON Web Tokens)
- **Password Security:** Argon2 hashing
- **API Documentation:** Swagger UI (OpenAPI)

---

## Project Structure

```text
backend/
 └── app/
     ├── models/        # Database models
     ├── routes/        # API routes
     ├── services/      # Business logic
     ├── utils/         # Security and helper utilities
     ├── database.py    # Database connection
     ├── config.py      # Configuration settings
     └── main.py        # Application entry point
requirements.txt

---

## Security Considerations

- Passwords are never stored in plain text
- Strong cryptographic hashing is used for credentials
- Authentication is handled using signed JWT tokens
- Environment variables are used for sensitive configuration

---

## API Access

The backend provides automatically generated API documentation using Swagger (OpenAPI),  
which allows developers to explore and test available endpoints during local development.

---

## Purpose

This project is developed as part of an academic requirement for Computer Engineering, with the goal of understanding the internal workings of secure payment systems and backend service design.

