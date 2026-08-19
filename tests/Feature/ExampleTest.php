<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * The root URL is not a page. Public registration is disabled and there is
     * no marketing front, so "/" exists only to send a guest to the login form —
     * which is why the stock scaffold assertion of a 200 here never held.
     */
    public function test_the_root_url_sends_a_guest_to_the_login_page(): void
    {
        $response = $this->get('/');

        $response->assertRedirect('/login');
    }
}
