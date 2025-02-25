const request = require('supertest');
const express = require('express');
const authController = require('../../src/controllers/authController');
const { OAuth2Client } = require('google-auth-library');
const app = express();

app.use(express.json());
app.post('/auth/login-employee', authController.loginEmployee);
app.post('/auth/login-student', authController.loginStudent);
app.post('/auth/login-google', authController.loginGoogle);
app.post('/auth/forget-password', authController.forgetPassword);
app.post('/auth/reset-password', authController.resetPassword);

jest.mock('../../src/services/authServices');
jest.mock('../../src/services/hashServices');
jest.mock('../../src/services/jwtServices');
jest.mock('../../src/services/sendEmailServices');
jest.mock('google-auth-library', () => {
    const mOAuth2Client = {
        verifyIdToken: jest.fn(),
    };
    return { OAuth2Client: jest.fn(() => mOAuth2Client) };
});


describe('Auth Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('POST /auth/login-employee', () => {
        it('should log in successfully with valid credentials', async () => {
            const mockEmployee = {
                id: 3,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                password: 'hashedpassword',
                employeeRole: 'EMPLOYEE',
                phone: '1234567890',
            };

            require('../../src/services/authServices').findEmployee.mockResolvedValue(mockEmployee.email);
            require('../../src/services/hashServices').compare.mockResolvedValue(true);
            require('../../src/services/jwtServices').sign.mockReturnValue('mockedToken');

            const response = await request(app)
                .post('/auth/login-employee')
                .send({ email: 'john@example.com', password: 'password' });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Login successful');
            expect(response.body.user).toHaveProperty('user');
            expect(response.body.token).toBe('mockedToken');
        });
        it('should log in fail with status 400', async () => {
            const mockEmployee = {
                id: 3,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                password: 'wrongpassword',
                employeeRole: 'EMPLOYEE',
                phone: '1234567890',
            };

            require('../../src/services/authServices').findEmployee.mockResolvedValue({ email: mockEmployee.email });
            require('../../src/services/hashServices').compare.mockResolvedValue(false);
            require('../../src/services/jwtServices').sign.mockReturnValue('mockedToken');

            const response = await request(app)
                .post('/auth/login-employee')
                .send({ email: 'john@example.com', password: 'password' });

            console.log
            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Password incorrect');
        });


    });

    describe('POST /auth/login-student', () => {
        it('should log in successfully with valid credentials', async () => {
            const mockStudent = {
                id: 1,
                studentId: 'S12345',
                firstName: 'Jane',
                lastName: 'Doe',
                email: 'jane@example.com',
                password: 'hashedpassword',
            };

            require('../../src/services/authServices').findStudent.mockResolvedValue(mockStudent);
            require('../../src/services/hashServices').compare.mockResolvedValue(true);
            require('../../src/services/jwtServices').sign.mockReturnValue('mockedToken');

            const response = await request(app)
                .post('/auth/login-student')
                .send({ identifier: 'jane@example.com', password: 'password' });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Login successful');
            expect(response.body.student).toHaveProperty('student');
            expect(response.body.token).toBe('mockedToken');
        });

    });


    describe('POST /auth/login-google', () => {
        let mockClient;

        beforeEach(() => {
            mockClient = new OAuth2Client();
            jest.spyOn(mockClient, 'verifyIdToken');

            require('../../src/services/authServices').findUserByGoogleId = jest.fn();
            require('../../src/services/authServices').findEmployee = jest.fn();
            require('../../src/services/authServices').createEmployee = jest.fn();
            require('../../src/services/authServices').updateEmployee = jest.fn();
            require('../../src/services/jwtServices').sign = jest.fn();
        });

        it('should log in successfully with valid Google token', async () => {
            const mockEmployee = {
                id: 3,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                employeeRole: 'EMPLOYEE',
            };

            const googleResponse = {
                sub: 'googleId123',
                email: 'john@example.com',
                given_name: 'John',
                family_name: 'Doe',
            };

            mockClient.verifyIdToken.mockResolvedValue({
                getPayload: jest.fn().mockReturnValue(googleResponse),
            });

            require('../../src/services/authServices').findUserByGoogleId.mockResolvedValue(googleResponse.sub);
            require('../../src/services/authServices').findEmployee.mockResolvedValue(mockEmployee);
            require('../../src/services/authServices').updateEmployee.mockResolvedValue(mockEmployee);
            require('../../src/services/jwtServices').sign.mockReturnValue('mockedToken');

            const response = await request(app)
                .post('/auth/login-google')
                .send({ token: 'googleToken123' });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Login successful');
            expect(response.body.user).toHaveProperty('employee');
            expect(response.body.token).toBe('mockedToken');
        });

        it('should fail login with invalid Google token', async () => {
            mockClient.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

            const response = await request(app)
                .post('/auth/login-google')
                .send({ token: 'invalidToken' });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Invalid token');
        });
    });

    describe('POST /auth/forget-password', () => {
        it('should send reset password email for valid email', async () => {
            const email = 'john@example.com';
            const mockEmployee = { id: 3, email };

            require('../../src/services/authServices').findEmployee.mockResolvedValue(mockEmployee);
            require('../../src/services/authServices').findStudent.mockResolvedValue(null);

            require('../../src/services/jwtServices').signResetToken.mockReturnValue('mockToken');
            require('../../src/services/sendEmailServices').sendResetEmail.mockResolvedValue(true);

            const response = await request(app)
                .post('/auth/forget-password')
                .send({ email });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Reset password email sent');
        });

    });

    describe('POST /auth/reset-password', () => {
        it('should reset password successfully with valid token and new password', async () => {
            const token = 'validResetToken';
            const newPassword = 'newPassword123';
            const mockDecodedToken = { employeeId: 3 };
            const mockEmployee = { id: 3, resetPasswordToken: token, resetPasswordExpires: new Date(Date.now() + 3600000) };

            require('../../src/services/jwtServices').verify.mockReturnValue(mockDecodedToken);
            require('../../src/services/authServices').findEmployeeById.mockResolvedValue(mockEmployee);
            require('../../src/services/hashServices').hash.mockResolvedValue('hashedNewPassword');
            require('../../src/services/authServices').updateEmployeePassword.mockResolvedValue(mockEmployee);

            const response = await request(app)
                .post('/auth/reset-password')
                .send({ token, newPassword });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Password has been reset successfully');
        });
    });

});
