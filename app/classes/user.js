// Dependencies =====================================================
var bcrypt = require('bcrypt-nodejs');
var uuid = require('node-uuid');
var Global = require('./global');
var Doodle = require('./doodle');
var async = require('async');

// User Model to interact with database

function user (email, first_name, last_name, password) {

	this.id = uuid.v4();
	this.email = email;
	this.first_name = first_name;
	this.last_name = last_name;
	this.password = Global.generateHash(password);
	this.statut = 'registred';

}

user.prototype.save = function (callback) {

	var queries = [
		{
			query : 'INSERT INTO user (id, email, first_name, last_name, password, statut) values (?, ?, ?, ?, ?, ?)',
			params : [ this.id, this.email, this.first_name, this.last_name, this.password, this.statut ]
		},
		{
			query : 'INSERT INTO user_by_email (email, user_id) values (?, ?)',
			params : [ this.email, this.id ]
		}
	];

	user.db.batch(queries, { prepare : true }, function (err, result) {
		if (err) {
			return callback(err);
		}

		return callback(null, result);
	});

};

/**
*	Basic authentication of user
**/
user.basicAuthentication = function (email, password, callback) {

	// We check if there is an user with this email
	user.findByEmail(email, function (err, user_data) {
		if (err) {
			return callback(err);
		}

		if (!user_data) {
			return callback('No user found with the email ' + email, false);
		}

		if (!user.validPassword(password, user_data.password) ) {
			return callback('Wrong password', false);
		}

		return callback(null, user_data);
	});
};

/**
*	Delete an user
**/
user.delete = function (user_id, current_user_id, callback) {

	// You have to be connected as the user to delete him
	if ( user_id === current_user_id ) {

		// We get every doodle associated with the user
		user.getDoodleIdsFromUser(user_id, function (err, doodle_ids) {

			// For every doodle associated, we delete the associations
			user.__processDelete(doodle_ids, user_id, 0, function (err, result) {
				if (err) {
					return callback(err);
				}

				// We destroy the user itself
				var query = 'DELETE FROM user WHERE id = ?';
				user.db.execute(query, [ user_id ], { prepare : true }, function (err, result) {
					if (err) {
						return callback(err);
					}

					return callback(null, true);
				});
			});
		});
	}
};

user.getDoodleIdsFromUser = function (user_id, callback) {

	var query = 'SELECT doodle_id FROM doodles_by_user WHERE user_id = ?';
	user.db.execute(query, [ user_id ], { prepare : true }, function (err, doodle_data) {
		if (err) {
			return callback(err);
		}

		// We send back an array
		var doodle_ids_array = [];
		for (var key in doodle_data.rows) {
			doodle_ids_array.push(doodle_data.rows[key].doodle_id);
		}

		return callback(null, doodle_ids_array);
	});
};

/**
*	Create a new public user
**/
user.newPublicUser = function (params , callback) {

	var user_id = uuid.v4();
	params.id = user_id;

	user.create(params, 'temporary', function (err, result) {
		if (err) {
			return callback(err);
		}

		return callback(null, user_id);
	});
};

/**
* Check if valid password
**/
user.validPassword = function (password, user_password) {
	return bcrypt.compareSync(password, user_password);
};

/**
*	Find user by email
**/
user.findByEmail = function (email, callback) {

	async.waterfall([
		function (callback) {

			var query = 'SELECT user_id FROM user_by_email WHERE email = ?';
			user.db.execute(query, [ email ], { prepare : true }, function (err, result) {
				if (err) {
					return callback(err);
				}

				if (!result.rows[0]) {
					return callback('No user with this email');
				}

				return callback(null, result.rows[0].user_id);
			});
		},

		function (user_id, callback) {
			user.get(user_id, callback);	
		}
	], function (err, result) {
		if (err) {
			return callback(err);
		}

		return callback(null, result);
	});
};

/**
*	Find a user with his id
**/
user.findById = function (id, callback) {

	var query = "SELECT * FROM user WHERE id = ?";

	user.db.execute(query, [ id ], { prepare : true },
		function (err, data) {
			(err) ? callback(err) : callback(null, data.rows[0]);
		});
};

/**
*	Create a new user in databse
*/
user.create = function (newUser, statut, callback) {

	var query = "INSERT INTO user (id, email, password, first_name, last_name, statut) values (?, ?, ?, ?, ?, ?)";

	user.db.execute(query, [ newUser.id, newUser.email, Global.generateHash(newUser.password), newUser.first_name, newUser.last_name, statut ], { prepare : true},
		function (err, result) {
			if (err) {
				return callback(err);
			}
			else {
				user.get(newUser.id, function (err, user_data) {
					if (err) {
						return callback(err);
					}

					return callback(null, user_data);
				});
			}
		}
	);
};

/**
*	Get user data
*/
user.get = function (id, callback) {

	var query = "SELECT * FROM user WHERE id = ?";

	user.db.execute(query, [ id ], { prepare : true },
		function (err, result) {
			(err) ? callback(err) : callback(null, result.rows[0]);
		});
};

/**
*	Get user with the email
**/
user.getUserByEmail = function (email, done) {

	var query = "SELECT * From user WHERE email = ?";

	user.db.execute(query, [ email ], { prepare : true },
		function (err, data) {
			if (err) {
				return done(err);
			}

			console.log(data);

			done(null, data.rows[0]);
		});
};

/**
*	Delete all the votes associated with the user on the doodle
**/
user.deleteVotes = function (doodle_id, user_id, callback) {

	// Get every schedules associated with the doodle
	getScheduleIds(doodle_id, function (err, schedule_ids) {
		if (err) {
			return callback(err);
		}

		var query = 'DELETE FROM votes_by_user WHERE doodle_id = ? AND user_id = ?';
		user.db.execute(query, [ doodle_id, user_id ], { prepare : true }, function (err, result) {
			if (err) {
				return callback(err);
			}

			// We delete the votes
			user.__processDeleteVotes(schedule_ids, doodle_id, user_id, 0, function (err, result) {
				if (err) {
					return callback(err);
				}

				return callback(null, true);
			});		
		});
	});
};

/**
*	Check if a user with that email exists
*	@return true if he exists, false otherwise
**/
user.check = function (email, callback) {

	var query = 'SELECT * FROM user_by_email WHERE email = ?';
	user.db.execute(query, [ email ], { prepare : true }, function (err, result) {
		if (err) {
			return callback(err);
		}

		if (result.rows.length > 0) {
			return callback(null, true);
		}
		else {
			return callback(null, false);
		}
	});
};

// INTERNAL FUNCTIONS ===============================================================

/**
*	Recursive function to delete all the votes associated with the user on the doodle
*	in the ( Table votes_by_schedule )
**/
user.__processDeleteVotes = function (schedule_ids, doodle_id, user_id, key, callback) {

	if ( schedule_ids.length != key ) {

		var schedule_id = schedule_ids[key];

		// Delete vote in ( Table votes_by_schedules )
		var query = 'DELETE FROM votes_by_schedule WHERE doodle_id = ? AND schedule_id = ? AND user_id = ?';
		user.db.execute(query, [ doodle_id, schedule_id, user_id ], { prepare : true }, function (err, result) {
			if (err) {
				return callback(err);
			}

			key++;
			user.__processDeleteVotes(schedule_ids, doodle_id, user_id, key, callback);
		});
	}
	else {
		return callback(null, true);
	}
}

/**
*	Recursive function to delete all the associations of a user with doodles
**/
user.__processDelete = function (doodle_ids, user_id, key, callback) {

	if (doodle_ids.length != key) {

		var doodle_id = doodle_ids[key];

		// Delete the association doodle-user ( Table doodles_by_user )
		var query = 'DELETE FROM doodles_by_user WHERE user_id = ?';
		user.db.execute(query, [ user_id ], { prepare : true }, function (err, result) {
			if (err) {
				return callback(err);
			}

			// Delete the association user-doodle ( Table users_by_doodle )
			query = 'DELETE FROM users_by_doodle WHERE doodle_id = ? AND user_id = ?';
			user.db.execute(query, [ doodle_id, user_id ], { prepare : true }, function (err, result) {
				if (err) {
					return callback(err);
				}

				// We check if the doodle has stil some user
				checkUsers(doodle_id, function (err, result) {
					if (err) {
						return callback(err);
					}

					// The doodle is empty, we delete it
					if (!result) {
						delete(doodle_id, function (err, result) {
							if (err) {
								return callback(err);
							}
						});

						key++;
						user.__processDelete(doodle_ids, user_id, key, callback);
					}
					else {
						// Delete all the votes associated with the user on that doodle
						user.deleteVotes(doodle_id, user_id, function (err, result) {
							if (err) {
								return callback(err);
							}

							key++;
							user.__processDelete(doodle_ids, user_id, key, callback);
						});
					}
				});
			});

		});

	}
	else {
		return callback(null, true);
	}

	// We destroy the association doodle-user ( Table doodles_by_user )

}

module.exports = user;
