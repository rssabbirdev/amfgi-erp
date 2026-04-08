import { adminApi } from '../adminApi';

interface User {
  _id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  companyAccess: Array<{ companyId: string; roleId: string }>;
  createdAt: Date;
}

export const usersApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      transformResponse: (r: { data: User[] }) => r.data,
      providesTags: [{ type: 'User', id: 'LIST' }, ...([] as any[])],
    }),

    createUser: builder.mutation<User, Partial<User> & { password: string }>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    updateUser: builder.mutation<User, { id: string; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'User', id },
        { type: 'User', id: 'LIST' },
      ],
    }),
  }),
});

export const { useGetUsersQuery, useCreateUserMutation, useUpdateUserMutation } = usersApi;
